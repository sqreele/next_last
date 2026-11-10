"""Tenancy definitions."""
from django.conf import settings
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Count, Q
from django.db import transaction
from ..models import Property, Tenant, TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric
from ..serializers import TenantSerializer, TenantMembershipSerializer, SubscriptionPlanSerializer, TenantSubscriptionSerializer, UsageMetricSerializer
from django.shortcuts import get_object_or_404
from ..tenancy import user_can_access_billing, enforce_tenant_user_limit, get_billing_tenants, lock_tenants_for_membership_change, get_user_tenants, tenant_usage_counts, tenant_limit_snapshot, user_can_manage_tenant
from ..billing.permissions import HasBillingAccess
from ..timezones import timezone_options
from ..entitlements import get_tenant_entitlement
from ..plan_capabilities import get_plan_capabilities, require_plan_feature
from ..subscription_permissions import get_subscription_enforcement_mode


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSerializer

    def perform_update(self, serializer):
        tenant = self.get_object()
        if not (user_can_manage_tenant(self.request.user, tenant) or user_can_access_billing(self.request.user, tenant)):
            raise PermissionDenied('Only a Company administrator can edit Company details.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        self.get_object()
        raise ValidationError({'detail': 'Company deletion is disabled. Cancel billing and preserve Property history.'})

    def get_queryset(self):
        qs = get_user_tenants(self.request.user).prefetch_related('memberships', 'properties')
        return qs.annotate(
            property_count=Count('properties', distinct=True),
            active_user_count=Count(
                'memberships',
                filter=Q(memberships__is_active=True),
                distinct=True,
            ),
        )

    def perform_create(self, serializer):
        if (
            not self.request.user.is_superuser
            and not getattr(settings, 'SELF_SERVICE_TENANT_CREATION_ENABLED', False)
        ):
            raise PermissionDenied(
                "Tenant creation is restricted to platform administrators."
            )
        if not self.request.user.is_superuser:
            if get_user_tenants(self.request.user).exists():
                raise PermissionDenied("Your user already belongs to a tenant.")
        tenant = serializer.save(owner=self.request.user)
        TenantMembership.objects.get_or_create(
            tenant=tenant,
            user=self.request.user,
            defaults={'role': 'owner'},
        )
        if not hasattr(tenant, 'subscription'):
            from ..tenancy import ensure_default_plan

            TenantSubscription.objects.create(
                tenant=tenant,
                plan=ensure_default_plan(),
                status='trialing',
            )

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[IsAuthenticated, HasBillingAccess],
    )
    def usage(self, request, pk=None):
        tenant = get_object_or_404(get_billing_tenants(request.user), pk=pk)
        counts = tenant_usage_counts(tenant)
        snapshot = tenant_limit_snapshot(tenant, usage_counts=counts)
        return Response({**counts, **snapshot})

    @action(
        detail=False,
        methods=['get'],
        url_path='billing',
        permission_classes=[IsAuthenticated, HasBillingAccess],
    )
    def billing(self, request):
        """Return only tenants for which the caller may access Billing."""
        tenants = get_billing_tenants(request.user).order_by('name')
        serializer = self.get_serializer(tenants, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='timezones')
    def timezones(self, request):
        return Response(timezone_options())


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasBillingAccess]
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.all()

    def get_queryset(self):
        qs = SubscriptionPlan.objects.all()
        if not self.request.user.is_superuser:
            qs = qs.filter(is_active=True)
        return qs.order_by('sort_order', 'monthly_price', 'name')

    def perform_create(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can create subscription plans.")
        serializer.save()

    def perform_update(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can update subscription plans.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Only a platform superuser can delete subscription plans.")
        instance.delete()


class TenantMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        if self.request.user.is_superuser:
            return TenantMembership.objects.select_related('tenant', 'user').prefetch_related('properties')
        return (
            TenantMembership.objects.select_related('tenant', 'user')
            .prefetch_related('properties')
            .filter(tenant__in=get_user_tenants(self.request.user))
        )

    def _get_tenant_from_request(self, serializer=None):
        tenant = None
        if serializer is not None:
            tenant = serializer.validated_data.get('tenant')
        if tenant is None:
            tenant_id = self.request.data.get('tenant') or self.request.query_params.get('tenant')
            if tenant_id:
                tenant = get_object_or_404(Tenant, pk=tenant_id)
        return tenant

    def _validate_membership_properties(self, tenant, serializer):
        properties = serializer.validated_data.get('properties')
        if properties is None and serializer.instance is not None:
            properties = serializer.instance.properties.all()
        properties = properties or []
        invalid = any(prop.tenant_id != tenant.id for prop in properties)
        if invalid:
            raise ValidationError({
                'properties': 'Every Property grant must belong to the authorized Company.'
            })

    def perform_create(self, serializer):
        tenant = self._get_tenant_from_request(serializer)
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        self._validate_membership_properties(tenant, serializer)
        if len(serializer.validated_data.get('properties') or []) > 1:
            require_plan_feature(tenant, 'advanced_property_permissions')
        with transaction.atomic():
            locked_tenant = lock_tenants_for_membership_change(tenant)[tenant.pk]
            if serializer.validated_data.get('is_active', True):
                enforce_tenant_user_limit(locked_tenant)
            membership = serializer.save(
                tenant=locked_tenant,
                invited_by=self.request.user,
            )
            for prop in membership.properties.all():
                if prop.tenant_id is None:
                    prop.tenant = membership.tenant
                    prop.save(update_fields=['tenant'])

    def perform_update(self, serializer):
        instance = self.get_object()
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        target_tenant = serializer.validated_data.get('tenant', instance.tenant)
        if not user_can_manage_tenant(self.request.user, target_tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        self._validate_membership_properties(target_tenant, serializer)
        if len(serializer.validated_data.get('properties') or []) > 1:
            require_plan_feature(target_tenant, 'advanced_property_permissions')
        source_tenant_id = instance.tenant_id
        with transaction.atomic():
            locked_tenants = lock_tenants_for_membership_change(
                source_tenant_id,
                target_tenant.pk,
            )
            locked_tenant = locked_tenants[target_tenant.pk]
            locked_membership = TenantMembership.objects.select_for_update().get(pk=instance.pk)
            if locked_membership.tenant_id != source_tenant_id:
                raise ValidationError({
                    'detail': 'Membership tenant changed concurrently; retry the request.'
                })
            if not user_can_manage_tenant(self.request.user, locked_membership.tenant):
                raise PermissionDenied("You do not have permission to manage this tenant.")
            desired_active = serializer.validated_data.get(
                'is_active', locked_membership.is_active,
            )
            increases_active_count = desired_active and (
                not locked_membership.is_active
                or locked_membership.tenant_id != locked_tenant.pk
            )
            if increases_active_count:
                enforce_tenant_user_limit(locked_tenant)
            serializer.instance = locked_membership
            membership = serializer.save(tenant=locked_tenant)
            for prop in membership.properties.all():
                if prop.tenant_id is None:
                    prop.tenant = membership.tenant
                    prop.save(update_fields=['tenant'])

    def perform_destroy(self, instance):
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class TenantSubscriptionViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only tenant billing status projection.

    Subscription lifecycle changes and deletion are platform-authority
    operations, not customer API operations.
    """
    permission_classes = [IsAuthenticated, HasBillingAccess]
    serializer_class = TenantSubscriptionSerializer

    def get_queryset(self):
        qs = TenantSubscription.objects.select_related('tenant', 'plan')
        if self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_billing_tenants(self.request.user))

    @action(detail=False, methods=['get'], url_path='entitlement')
    def entitlement(self, request):
        """Return one authorized Tenant's normalized, provider-safe state."""
        tenant_ref = str(request.query_params.get('tenant_id') or '').strip()
        property_ref = str(request.query_params.get('property_id') or '').strip()
        if bool(tenant_ref) == bool(property_ref):
            raise ValidationError({
                'detail': 'Provide exactly one of tenant_id or property_id.'
            })

        if property_ref:
            properties = Property.objects.select_related('tenant').filter(
                property_id=property_ref,
                tenant__in=get_billing_tenants(request.user),
            )
            property_obj = get_object_or_404(properties)
            tenant = property_obj.tenant
        else:
            tenants = get_billing_tenants(request.user)
            tenant = get_object_or_404(tenants, tenant_id=tenant_ref)

        entitlement = get_tenant_entitlement(tenant)
        try:
            subscription = tenant.subscription
        except TenantSubscription.DoesNotExist:
            subscription = None

        can_manage_billing = True
        snapshot = tenant_limit_snapshot(tenant)

        return Response({
            'tenant_id': tenant.tenant_id,
            'plan': ({
                'id': subscription.plan_id,
                'code': subscription.plan.code,
                'name': subscription.plan.name,
            } if subscription else None),
            'status': subscription.status if subscription else 'missing',
            'entitlement_level': entitlement.level.value,
            'can_read': entitlement.can_read,
            'can_write': entitlement.can_write,
            'can_manage_billing': can_manage_billing,
            'can_start_checkout': bool(
                can_manage_billing
                and subscription
                and not subscription.external_subscription_id
            ),
            'reason_code': entitlement.reason_code,
            'grace_ends_at': (
                entitlement.grace_ends_at.isoformat()
                if entitlement.grace_ends_at else None
            ),
            'current_period_end': (
                subscription.current_period_end.isoformat()
                if subscription and subscription.current_period_end else None
            ),
            'trial_ends_at': (
                subscription.trial_ends_at.isoformat()
                if subscription and subscription.trial_ends_at else None
            ),
            'grace_period_ends_at': (
                subscription.grace_period_ends_at.isoformat()
                if subscription and subscription.grace_period_ends_at else None
            ),
            'cancel_at_period_end': bool(
                subscription and subscription.cancel_at_period_end
            ),
            'enforcement_mode': get_subscription_enforcement_mode(),
            'features': get_plan_capabilities(subscription) if subscription else get_plan_capabilities(None),
            **snapshot,
        })


class UsageMetricViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, HasBillingAccess]
    serializer_class = UsageMetricSerializer

    def get_queryset(self):
        qs = UsageMetric.objects.select_related('tenant')
        if self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_billing_tenants(self.request.user))
