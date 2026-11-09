import logging

import stripe
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.fields import IntegerField
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import BillingInvoice, BillingProfile, SubscriptionPlan, Tenant, TenantSubscription
from ..tenancy import get_billing_tenants
from .permissions import HasBillingAccess
from .stripe_service import (
    StripeBillingError,
    construct_webhook_event,
    create_checkout_session,
    create_portal_session,
    process_webhook_event,
)


logger = logging.getLogger('billing.stripe')


def _billing_tenant(request, tenant_ref):
    tenant_ref = str(tenant_ref or '').strip()
    if not tenant_ref:
        raise ValidationError({'tenant_id': 'This field is required.'})
    queryset = get_billing_tenants(request.user).filter(tenant_id=tenant_ref)
    try:
        return queryset.get()
    except Tenant.DoesNotExist as exc:
        from django.http import Http404

        raise Http404('Billing tenant is unavailable.') from exc


def _service_error(exc):
    unavailable_codes = {'stripe_not_configured', 'stripe_webhook_not_configured', 'billing_issuer_missing'}
    http_status = getattr(exc, 'http_status', None) or (
        status.HTTP_503_SERVICE_UNAVAILABLE
        if exc.code in unavailable_codes else status.HTTP_400_BAD_REQUEST
    )
    return Response({'code': exc.code, 'detail': str(exc)}, status=http_status)


def _provider_action(operation):
    try:
        return operation()
    except StripeBillingError as exc:
        return _service_error(exc)
    except stripe.StripeError:
        logger.exception('stripe_invoice_operation_failed')
        return Response({'code': 'billing_provider_error', 'detail': 'Billing provider is unavailable. Please try again.'}, status=502)
    except TenantSubscription.DoesNotExist:
        raise ValidationError({'detail': 'No subscription is available for this tenant.'})


class BillingProfileView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        from .documents import BillingProfileSerializer, issuer_details
        tenant = _billing_tenant(request, request.query_params.get('tenant_id'))
        profile = BillingProfile.objects.filter(tenant=tenant).first()
        try:
            issuer_details()
            issuer_ready = True
        except StripeBillingError:
            issuer_ready = False
        return Response({
            'profile': BillingProfileSerializer(profile).data if profile else None,
            'provider_available': bool(getattr(settings, 'STRIPE_SECRET_KEY', '')),
            'issuer_ready': issuer_ready,
            'promptpay_available': issuer_ready and bool(getattr(settings, 'STRIPE_SECRET_KEY', '')) and any(getattr(settings, 'STRIPE_PROMPTPAY_PRICE_MAP', {}).values()),
        })

    def post(self, request):
        from .documents import BillingProfileSerializer
        from .promptpay import update_stripe_profile
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        allowed = {'tenant_id', 'legal_name', 'address', 'tax_id', 'branch', 'email'}
        if set(request.data) - allowed:
            raise ValidationError({'detail': 'Unsupported billing profile fields.'})
        def save():
            with transaction.atomic():
                local = TenantSubscription.objects.select_for_update().get(tenant=tenant)
                current = BillingProfile.objects.filter(tenant=tenant).first()
                serializer = BillingProfileSerializer(current, data={key: value for key, value in request.data.items() if key != 'tenant_id'})
                serializer.is_valid(raise_exception=True)
                profile = serializer.save(tenant=tenant)
                if local.external_customer_id:
                    update_stripe_profile(local.external_customer_id, profile)
            return Response({'profile': serializer.data})
        return _provider_action(save)


class PromptPayInvoiceView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        from .promptpay import promptpay_quotes
        _billing_tenant(request, request.query_params.get('tenant_id'))
        return _provider_action(lambda: Response({'results': promptpay_quotes()}))

    def post(self, request):
        from .promptpay import create_promptpay_invoice
        if set(request.data) - {'tenant_id', 'plan'}:
            raise ValidationError({'detail': 'Unsupported invoice fields.'})
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        plan_id = IntegerField(min_value=1).run_validation(request.data.get('plan'))
        plan = get_object_or_404(SubscriptionPlan.objects.filter(is_active=True), pk=plan_id)
        return _provider_action(lambda: Response({'url': create_promptpay_invoice(tenant, request.user, plan)}))


class BillingInvoiceListView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        from .documents import document_summary
        tenant = _billing_tenant(request, request.query_params.get('tenant_id'))
        try:
            before = int(request.query_params.get('before') or 0)
        except ValueError:
            raise ValidationError({'before': 'Invalid document cursor.'})
        documents = BillingInvoice.objects.filter(tenant=tenant).order_by('-pk')
        if before:
            documents = documents.filter(pk__lt=before)
        page = list(documents[:26])
        return Response({'results': [document_summary(doc) for doc in page[:25]],
                         'next_before': page[24].pk if len(page) > 25 else None})

    def post(self, request):
        from .promptpay import refresh_invoices
        if set(request.data) - {'tenant_id'}:
            raise ValidationError({'detail': 'Unsupported refresh fields.'})
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        def refresh():
            refresh_invoices(tenant)
            return Response({'refreshed': True})
        return _provider_action(refresh)


class BillingInvoicePayView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def post(self, request):
        from .promptpay import invoice_payment_url
        if set(request.data) - {'tenant_id', 'document_id'}:
            raise ValidationError({'detail': 'Unsupported payment fields.'})
        tenant = _billing_tenant(request, request.data.get('tenant_id'))
        document_id = IntegerField(min_value=1).run_validation(request.data.get('document_id'))
        document = get_object_or_404(BillingInvoice, tenant=tenant, pk=document_id)
        return _provider_action(lambda: Response({'url': invoice_payment_url(document)}))


class BillingDocumentView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

    def get(self, request):
        from .documents import render_document_pdf
        tenant = _billing_tenant(request, request.query_params.get('tenant_id'))
        document_id = IntegerField(min_value=1).run_validation(request.query_params.get('document_id'))
        document = get_object_or_404(BillingInvoice, tenant=tenant, pk=document_id)
        kind = request.query_params.get('kind', 'invoice')
        if kind not in {'invoice', 'receipt'}:
            raise ValidationError({'kind': 'Select invoice or receipt.'})
        try:
            pdf = render_document_pdf(document, receipt=kind == 'receipt')
        except StripeBillingError as exc:
            return _service_error(exc)
        number = document.receipt_number if kind == 'receipt' else document.number
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{number}.pdf"'
        response['Cache-Control'] = 'private, no-store'
        return response


class StripeCheckoutView(APIView):
    permission_classes = [IsAuthenticated, HasBillingAccess]

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
    permission_classes = [IsAuthenticated, HasBillingAccess]

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
