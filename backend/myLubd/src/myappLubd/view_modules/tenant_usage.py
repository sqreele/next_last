from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    UsageMetric,
    UserProfile,
)
from ..serializers import (
    SubscriptionPlanSerializer,
    TenantMembershipSerializer,
    TenantSerializer,
    TenantSubscriptionSerializer,
    UsageMetricSerializer,
)
from ..tenancy import (
    enforce_subscription_limit,
    get_user_tenants,
    tenant_usage_counts,
    user_can_manage_tenant,
)
from ..timezones import timezone_options


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSerializer

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
        if not (self.request.user.is_staff or self.request.user.is_superuser):
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

    @action(detail=True, methods=['get'])
    def usage(self, request, pk=None):
        tenant = self.get_object()
        return Response(tenant_usage_counts(tenant))

    @action(detail=False, methods=['get'], url_path='timezones')
    def timezones(self, request):
        return Response(timezone_options())


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.all()

    def get_queryset(self):
        qs = SubscriptionPlan.objects.all()
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            qs = qs.filter(is_active=True)
        return qs.order_by('sort_order', 'monthly_price', 'name')

    def perform_create(self, serializer):
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            raise PermissionDenied("Only staff can create subscription plans.")
        serializer.save()

    def perform_update(self, serializer):
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            raise PermissionDenied("Only staff can update subscription plans.")
        serializer.save()

    def perform_destroy(self, instance):
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            raise PermissionDenied("Only staff can delete subscription plans.")
        instance.delete()


class TenantMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        if self.request.user.is_staff or self.request.user.is_superuser:
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
        properties = serializer.validated_data.get('properties') or []
        invalid = [prop.name for prop in properties if prop.tenant_id and prop.tenant_id != tenant.id]
        if invalid:
            raise ValidationError({
                'properties': f"Properties must belong to tenant {tenant.name}: {', '.join(invalid)}"
            })

    def perform_create(self, serializer):
        tenant = self._get_tenant_from_request(serializer)
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        enforce_subscription_limit(tenant, 'max_users')
        self._validate_membership_properties(tenant, serializer)
        membership = serializer.save(invited_by=self.request.user)
        for prop in membership.properties.all():
            if prop.tenant_id is None:
                prop.tenant = membership.tenant
                prop.save(update_fields=['tenant'])
            if prop.tenant_id != membership.tenant_id:
                continue
            prop.users.add(membership.user)
            profile, _ = UserProfile.objects.get_or_create(user=membership.user)
            profile.properties.add(prop)

    def perform_update(self, serializer):
        instance = self.get_object()
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        self._validate_membership_properties(instance.tenant, serializer)
        membership = serializer.save()
        for prop in membership.properties.all():
            if prop.tenant_id is None:
                prop.tenant = membership.tenant
                prop.save(update_fields=['tenant'])
            if prop.tenant_id != membership.tenant_id:
                continue
            prop.users.add(membership.user)
            profile, _ = UserProfile.objects.get_or_create(user=membership.user)
            profile.properties.add(prop)

    def perform_destroy(self, instance):
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this tenant.")
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class TenantSubscriptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSubscriptionSerializer

    def get_queryset(self):
        qs = TenantSubscription.objects.select_related('tenant', 'plan')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_user_tenants(self.request.user))

    def perform_create(self, serializer):
        tenant = serializer.validated_data.get('tenant')
        if not user_can_manage_tenant(self.request.user, tenant):
            raise PermissionDenied("You do not have permission to manage this subscription.")
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        if not user_can_manage_tenant(self.request.user, instance.tenant):
            raise PermissionDenied("You do not have permission to manage this subscription.")
        serializer.save()


class UsageMetricViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UsageMetricSerializer

    def get_queryset(self):
        qs = UsageMetric.objects.select_related('tenant')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(tenant__in=get_user_tenants(self.request.user))

