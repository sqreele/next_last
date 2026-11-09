from django.conf import settings
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import BillingChange, BillingInvoice, BillingPrice, Property, TenantSubscription
from .company_service import MODEL, change_summary, confirm_change, preview_change
from .permissions import HasBillingAccess
from .serializers import CompanyConfirmSerializer, CompanyPreviewSerializer
from .views import _billing_tenant, _provider_action


class CompanyOverviewView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        tenant = _billing_tenant(request, request.query_params.get('tenant_id'))
        local = TenantSubscription.objects.get(tenant=tenant)
        enrollments = {row.property_id: row for row in local.property_enrollments.all()}
        now = timezone.now()
        from .coverage import paid_property_ids, operable_property_filter
        paid_ids = set(paid_property_ids(now).filter(property__tenant=tenant).values_list('property_id', flat=True))
        active_ids = set(Property.objects.filter(operable_property_filter(now), tenant=tenant, archived_at__isnull=True).values_list('pk', flat=True))
        properties = []
        for prop in Property.objects.filter(tenant=tenant).order_by('name'):
            enrollment = enrollments.get(prop.pk)
            paid = prop.pk in paid_ids
            properties.append({'property_id': prop.property_id, 'name': prop.name,
                'status': ('active' if paid else 'trialing' if prop.pk in active_ids and enrollment and enrollment.state == 'pending_payment' else 'grace' if prop.pk in active_ids and enrollment else enrollment.state if enrollment else 'draft'),
                'billable': bool(enrollment and not enrollment.ended_at and (
                    enrollment.state == 'billable' or (enrollment.state == 'pending_payment' and local.billing_quantity == local.desired_quantity and local.billing_quantity > 0))),
                'paid': paid, 'archived': bool(prop.archived_at),
                'paid_through_at': enrollment.paid_through_at.isoformat() if enrollment and enrollment.paid_through_at else None})
        prices = list(BillingPrice.objects.filter(is_active=True, livemode=False).values('currency', 'unit_amount_minor'))
        current_price = BillingPrice.objects.filter(stripe_price_id=local.stripe_price_id).first()
        unit = current_price.unit_amount_minor if current_price else (2000 if tenant.billing_model != MODEL else None)
        admin = request.user.is_superuser or tenant.memberships.filter(user=request.user, role='company_admin', is_active=True).exists()
        pending = BillingChange.objects.filter(tenant=tenant, state__in=['applying', 'awaiting_payment']).first()
        due = BillingInvoice.objects.filter(tenant=tenant, provider_subscription_id=local.external_subscription_id or '', status='open').aggregate(total=Sum('amount_remaining_minor', default=0))['total']
        return Response({
            'tenant_id': tenant.tenant_id, 'name': tenant.name, 'billing_model': tenant.billing_model,
            'timezone': tenant.timezone, 'amount_due_minor': due,
            'enabled': bool(getattr(settings, 'COMPANY_BILLING_ENABLED', False)),
            'billing_email': tenant.billing_email, 'currency': tenant.billing_currency.upper() or 'USD',
            'status': local.status, 'reconciliation_status': local.reconciliation_status,
            'billing_status': 'cancelled' if local.status == 'cancelled' else ('past_due' if local.status == 'past_due' else 'awaiting_payment' if due or not any(p['paid'] for p in properties) else 'paid'),
            'total_properties': len(properties), 'active_properties': len(active_ids),
            'billing_quantity': local.billing_quantity, 'desired_quantity': local.desired_quantity,
            'unit_amount_minor': unit,
            'monthly_total_minor': unit * local.billing_quantity if unit is not None else None,
            'payment_method': local.payment_method_type or 'card',
            'next_billing_at': local.provider_period_end_at.isoformat() if local.provider_period_end_at else None,
            'cancel_at_period_end': local.cancel_at_period_end, 'revision': local.billing_revision,
            'properties': properties, 'prices': prices,
            'can_modify': admin, 'pending_change': change_summary(pending) if pending else None,
            'plan_name': 'StayMaint Property Subscription' if tenant.billing_model == MODEL else local.plan.name,
        })


class CompanyPreviewView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def post(self, request):
        serializer = CompanyPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        tenant = _billing_tenant(request, data.pop('tenant_id'))
        return _provider_action(lambda: Response(change_summary(preview_change(tenant, request.user, **data))))


class CompanyConfirmView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def post(self, request):
        serializer = CompanyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant = _billing_tenant(request, serializer.validated_data['tenant_id'])
        def confirm():
            change = confirm_change(tenant, request.user, serializer.validated_data['operation_id'])
            return Response(change_summary(change), status=200 if change.state == 'completed' else 202)
        return _provider_action(confirm)


class CompanyOperationView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        from rest_framework.fields import UUIDField
        tenant = _billing_tenant(request, request.query_params.get('tenant_id'))
        operation_id = UUIDField().run_validation(request.query_params.get('operation_id'))
        operation = get_object_or_404(BillingChange, pk=operation_id, tenant=tenant)
        return Response(change_summary(operation))
