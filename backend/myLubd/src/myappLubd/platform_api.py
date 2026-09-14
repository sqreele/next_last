"""Read-only, capability-gated global platform dashboard APIs.

These views deliberately do not reuse tenant-scoped viewsets.  They expose
only safe operational summaries to internal platform operators.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .entitlements import get_tenant_entitlement
from .models import BillingWebhookEvent, Tenant, TenantSubscription, UsageMetric
from .pagination import StandardResultsSetPagination
from .platform_authorization import PlatformCapability
from .platform_permissions import HasPlatformCapability


def _provider_mode():
    """Return deployment mode only; never return a provider credential."""
    key = str(getattr(settings, 'STRIPE_SECRET_KEY', '') or '')
    if key.startswith('sk_test_'):
        return 'test'
    if key.startswith('sk_live_'):
        return 'live'
    return 'unconfigured'


def _binding(subscription):
    customer = str(subscription.external_customer_id or '')
    provider_subscription = str(subscription.external_subscription_id or '')
    return {
        'customer_bound': bool(customer),
        'subscription_bound': bool(provider_subscription),
        'provider_mode': _provider_mode(),
        # A short suffix supports correlation without exposing an identifier.
        'customer_suffix': customer[-4:] if customer else None,
        'subscription_suffix': provider_subscription[-4:] if provider_subscription else None,
    }


def _entitlement(tenant):
    entitlement = get_tenant_entitlement(tenant)
    return {
        'entitlement_level': entitlement.level.value,
        'reason_code': entitlement.reason_code,
        'enforcement_mode': 'write_enabled' if entitlement.can_write else 'read_only',
    }


def _subscription_summary(subscription, include_reason=True):
    data = {
        'id': subscription.pk,
        'plan': {'code': subscription.plan.code, 'name': subscription.plan.name},
        'status': subscription.status,
        'current_period_start': subscription.current_period_start,
        'current_period_end': subscription.current_period_end,
        'trial_ends_at': subscription.trial_ends_at,
        'grace_period_ends_at': subscription.grace_period_ends_at,
        'cancel_at_period_end': subscription.cancel_at_period_end,
        'updated_at': subscription.updated_at,
        **_binding(subscription),
    }
    if include_reason:
        data.update(_entitlement(subscription.tenant))
    return data


class PlatformReadView(APIView):
    """Base view for a single declared platform capability."""

    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = None


class PlatformTenantsView(PlatformReadView):
    platform_capability = PlatformCapability.TENANTS_READ

    def get(self, request):
        qs = Tenant.objects.select_related('subscription__plan').annotate(
            property_count=Count('properties', distinct=True),
            active_membership_count=Count(
                'memberships', filter=Q(memberships__is_active=True), distinct=True,
            ),
        ).order_by('name')
        search = str(request.query_params.get('search', '')).strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(tenant_id__icontains=search))
        for field, lookup in (('status', 'status'), ('plan', 'subscription__plan__code'),
                              ('subscription_status', 'subscription__status')):
            value = str(request.query_params.get(field, '')).strip()
            if value:
                qs = qs.filter(**{lookup: value})
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        tenants = page if page is not None else qs
        results = []
        for tenant in tenants:
            subscription = getattr(tenant, 'subscription', None)
            if not subscription:
                continue
            summary = _subscription_summary(subscription)
            entitlement_filter = str(request.query_params.get('entitlement', '')).strip()
            if entitlement_filter and summary['entitlement_level'] != entitlement_filter:
                continue
            results.append({
                'tenant_id': tenant.tenant_id, 'name': tenant.name, 'status': tenant.status,
                'timezone': tenant.timezone, 'created_at': tenant.created_at, 'updated_at': tenant.updated_at,
                'property_count': tenant.property_count, 'active_membership_count': tenant.active_membership_count,
                'subscription': summary,
            })
        return paginator.get_paginated_response(results) if page is not None else Response(results)


class PlatformTenantDetailView(PlatformReadView):
    platform_capability = PlatformCapability.TENANTS_READ

    def get(self, request, tenant_id):
        tenant = get_object_or_404(
            Tenant.objects.select_related('subscription__plan').prefetch_related(
                'properties', 'memberships__user', 'memberships__properties', 'usage_metrics',
            ), tenant_id=tenant_id,
        )
        subscription = tenant.subscription
        memberships = [{
            'user': membership.user.get_username(), 'role': membership.role,
            'is_active': membership.is_active,
            'property_scope': {'all_tenant_properties': not membership.properties.exists(),
                               'assigned_property_count': membership.properties.count()},
        } for membership in tenant.memberships.all()]
        latest_usage = tenant.usage_metrics.all()[:1]
        events = BillingWebhookEvent.objects.aggregate(
            total=Count('id'), failed=Count('id', filter=Q(status='failed')),
        )
        return Response({
            'tenant_id': tenant.tenant_id, 'name': tenant.name, 'status': tenant.status,
            'timezone': tenant.timezone, 'created_at': tenant.created_at,
            'properties': [{'property_id': prop.property_id, 'name': prop.name,
                            'status': getattr(prop, 'status', None)} for prop in tenant.properties.all()],
            'memberships': memberships,
            'subscription': _subscription_summary(subscription),
            'usage': [_usage_summary(metric) for metric in latest_usage],
            'stripe_binding': _binding(subscription),
            # Receipts are not tenant-linked in the current schema.
            'webhook_summary': {'tenant_association_available': False, 'total_receipts': events['total'],
                                'failed_receipt_count': events['failed'], 'latest_processed_at': None},
        })


def _usage_summary(metric):
    return {
        'tenant_id': metric.tenant.tenant_id, 'tenant_name': metric.tenant.name,
        'period_start': metric.period_start, 'period_end': metric.period_end,
        'property_count': metric.property_count, 'active_user_count': metric.active_user_count,
        'work_order_count': metric.work_order_count, 'asset_count': metric.asset_count,
        'pm_schedule_count': metric.pm_schedule_count, 'storage_mb': metric.storage_mb,
        'calculated_at': metric.calculated_at,
    }


class PlatformSubscriptionsView(PlatformReadView):
    platform_capability = PlatformCapability.BILLING_READ

    def get(self, request):
        qs = TenantSubscription.objects.select_related('tenant', 'plan').order_by('tenant__name')
        filters = {'tenant': 'tenant__tenant_id', 'plan': 'plan__code', 'status': 'status'}
        for parameter, lookup in filters.items():
            value = str(request.query_params.get(parameter, '')).strip()
            if value:
                qs = qs.filter(**{lookup: value})
        if request.query_params.get('cancel_at_period_end') in {'true', 'false'}:
            qs = qs.filter(cancel_at_period_end=request.query_params['cancel_at_period_end'] == 'true')
        if request.query_params.get('unbound') == 'true':
            qs = qs.filter(Q(external_customer_id__isnull=True) | Q(external_subscription_id__isnull=True))
        if request.query_params.get('expiring_soon') == 'true':
            end = timezone.localdate() + timedelta(days=min(int(request.query_params.get('days', 14)), 90))
            qs = qs.filter(Q(trial_ends_at__date__range=(timezone.localdate(), end)) |
                           Q(current_period_end__range=(timezone.localdate(), end)))
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = []
        for subscription in page if page is not None else qs:
            item = _subscription_summary(subscription)
            if request.query_params.get('entitlement') and item['entitlement_level'] != request.query_params['entitlement']:
                continue
            item.update({'tenant_id': subscription.tenant.tenant_id, 'tenant_name': subscription.tenant.name,
                         'tenant_timezone': subscription.tenant.timezone})
            rows.append(item)
        return paginator.get_paginated_response(rows) if page is not None else Response(rows)


class PlatformSubscriptionDetailView(PlatformReadView):
    platform_capability = PlatformCapability.BILLING_READ

    def get(self, request, pk):
        subscription = get_object_or_404(TenantSubscription.objects.select_related('tenant', 'plan'), pk=pk)
        item = _subscription_summary(subscription)
        item.update({'tenant_id': subscription.tenant.tenant_id, 'tenant_name': subscription.tenant.name})
        return Response(item)


class PlatformUsageView(PlatformReadView):
    platform_capability = PlatformCapability.USAGE_READ

    def get(self, request):
        qs = UsageMetric.objects.select_related('tenant').order_by('-period_start', 'tenant__name')
        tenant = str(request.query_params.get('tenant', '')).strip()
        period = str(request.query_params.get('period_start', '')).strip()
        if tenant:
            qs = qs.filter(tenant__tenant_id=tenant)
        if period:
            qs = qs.filter(period_start=period)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        rows = [_usage_summary(metric) for metric in (page if page is not None else qs)]
        return paginator.get_paginated_response(rows) if page is not None else Response(rows)


class PlatformWebhookEventsView(PlatformReadView):
    platform_capability = PlatformCapability.BILLING_DIAGNOSTICS_READ

    def get(self, request):
        qs = BillingWebhookEvent.objects.order_by('-received_at')
        for parameter in ('provider', 'event_type', 'status'):
            value = str(request.query_params.get(parameter, '')).strip()
            if value:
                qs = qs.filter(**{parameter: value})
        if request.query_params.get('from'):
            qs = qs.filter(received_at__date__gte=request.query_params['from'])
        if request.query_params.get('to'):
            qs = qs.filter(received_at__date__lte=request.query_params['to'])
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        events = page if page is not None else qs
        rows = [{'provider': event.provider, 'event_type': event.event_type,
                 'received_at': event.received_at, 'processed_at': event.processed_at,
                 'status': event.status, 'error_code': event.error_code,
                 'tenant_association_available': False} for event in events]
        return paginator.get_paginated_response(rows) if page is not None else Response(rows)


class PlatformSummaryView(PlatformReadView):
    platform_capability = PlatformCapability.TENANTS_READ

    def get(self, request):
        subscriptions = TenantSubscription.objects.select_related('tenant', 'plan')
        today = timezone.localdate()
        soon = today + timedelta(days=14)
        summaries = [_subscription_summary(subscription) for subscription in subscriptions]
        attention_subscriptions = []
        for subscription, summary in zip(subscriptions, summaries):
            deadline = (
                summary['trial_ends_at'].date() if summary['status'] == 'trialing' and summary['trial_ends_at'] else
                summary['grace_period_ends_at'].date() if summary['status'] == 'past_due' and summary['grace_period_ends_at'] else
                summary['current_period_end'] if summary['status'] in ('active', 'cancelled') else None
            )
            if deadline and today <= deadline <= soon:
                attention_subscriptions.append({
                    'tenant_id': subscription.tenant.tenant_id, 'tenant_name': subscription.tenant.name,
                    'tenant_timezone': subscription.tenant.timezone, **summary,
                })
        return Response({
            'total_tenants': Tenant.objects.count(), 'active_tenants': Tenant.objects.filter(status='active').count(),
            'trialing_subscriptions': sum(row['status'] == 'trialing' for row in summaries),
            'active_subscriptions': sum(row['status'] == 'active' for row in summaries),
            'past_due_subscriptions': sum(row['status'] == 'past_due' for row in summaries),
            'cancelled_subscriptions': sum(row['status'] == 'cancelled' for row in summaries),
            'subscriptions_expiring_soon': TenantSubscription.objects.filter(
                Q(trial_ends_at__date__range=(today, soon)) | Q(current_period_end__range=(today, soon)),
            ).count(),
            'unbound_subscriptions': TenantSubscription.objects.filter(
                Q(external_customer_id__isnull=True) | Q(external_subscription_id__isnull=True),
            ).count(),
            'provider_mode': _provider_mode(),
            'test_mode_warning_count': TenantSubscription.objects.count() if _provider_mode() == 'test' else 0,
            'attention_subscriptions': attention_subscriptions,
        })
