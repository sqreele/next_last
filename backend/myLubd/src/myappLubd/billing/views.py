import logging

import stripe
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import SubscriptionPlan, Tenant
from ..tenancy import get_active_membership, get_user_tenants
from .stripe_service import (
    StripeBillingError,
    construct_webhook_event,
    create_checkout_session,
    create_portal_session,
    process_webhook_event,
)


logger = logging.getLogger('billing.stripe')
ALLOWED_BILLING_ROLES = {'owner', 'admin', 'billing'}


def _billing_tenant(request, tenant_ref):
    tenant_ref = str(tenant_ref or '').strip()
    if not tenant_ref:
        raise ValidationError({'tenant_id': 'This field is required.'})
    queryset = Tenant.objects.filter(tenant_id=tenant_ref)
    if not request.user.is_superuser:
        queryset = queryset.filter(pk__in=get_user_tenants(request.user).values('pk'))
    try:
        tenant = queryset.get()
    except Tenant.DoesNotExist as exc:
        raise PermissionDenied('Billing tenant is unavailable.') from exc
    if not request.user.is_superuser:
        membership = get_active_membership(request.user, tenant)
        if not membership or membership.role not in ALLOWED_BILLING_ROLES:
            raise PermissionDenied('Your tenant role cannot manage billing.')
    return tenant


def _service_error(exc):
    unavailable_codes = {'stripe_not_configured', 'stripe_webhook_not_configured'}
    http_status = (
        status.HTTP_503_SERVICE_UNAVAILABLE
        if exc.code in unavailable_codes else status.HTTP_400_BAD_REQUEST
    )
    return Response({'code': exc.code, 'detail': str(exc)}, status=http_status)


class StripeCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        allowed_fields = {'tenant_id', 'plan'}
        unexpected = sorted(set(request.data.keys()) - allowed_fields)
        if unexpected:
            raise ValidationError({'detail': 'Unsupported checkout fields were provided.'})
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        plan_ref = request.data.get('plan')
        plans = SubscriptionPlan.objects.filter(is_active=True)
        if isinstance(plan_ref, int) or (isinstance(plan_ref, str) and plan_ref.isdigit()):
            plans = plans.filter(pk=plan_ref)
        else:
            plans = plans.filter(code=str(plan_ref or '').strip())
        try:
            plan = plans.get()
            url = create_checkout_session(tenant, request.user, plan)
        except SubscriptionPlan.DoesNotExist:
            raise ValidationError({'plan': 'Select an available StayMaint plan.'})
        except StripeBillingError as exc:
            return _service_error(exc)
        except stripe.StripeError:
            logger.exception('stripe_checkout_failed', extra={'tenant_id': tenant.tenant_id})
            return Response(
                {'code': 'billing_provider_error', 'detail': 'Billing provider is unavailable.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'url': url})


class StripePortalView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        unexpected = sorted(set(request.data.keys()) - {'tenant_id'})
        if unexpected:
            raise ValidationError({'detail': 'Unsupported portal fields were provided.'})
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        try:
            url = create_portal_session(tenant)
        except StripeBillingError as exc:
            return _service_error(exc)
        except stripe.StripeError:
            logger.exception('stripe_portal_failed', extra={'tenant_id': tenant.tenant_id})
            return Response(
                {'code': 'billing_provider_error', 'detail': 'Billing provider is unavailable.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'url': url})


@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        signature = request.META.get('HTTP_STRIPE_SIGNATURE', '')
        try:
            event = construct_webhook_event(request.body, signature)
        except (ValueError, stripe.SignatureVerificationError):
            return Response(
                {'code': 'invalid_stripe_signature', 'detail': 'Invalid webhook signature.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except StripeBillingError as exc:
            return _service_error(exc)

        try:
            processed = process_webhook_event(event)
        except Exception:
            return Response(
                {'code': 'webhook_processing_failed', 'detail': 'Webhook processing failed.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({'accepted': True, 'duplicate': not processed})
