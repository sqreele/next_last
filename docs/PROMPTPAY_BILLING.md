# PromptPay and non-VAT billing

For the quantity-based USD/THB Company implementation, policy A and the current
rollout gates, see [Company billing rollout](COMPANY_BILLING_ROLLOUT.md). The
plan-based flow described below remains for legacy Companies.

StayMaint can create Stripe subscriptions using `collection_method=send_invoice`
and `payment_method_types=['promptpay']`. Customers authorize each payment in
their banking app. The current Stripe configuration intentionally accepts test
keys only. This change does not enable live payments or change entitlement
enforcement from its existing setting.

## Configuration

Provide the verified legal issuer through the backend environment. Do not use
the StayMaint brand alone in place of the person or entity receiving revenue.

```dotenv
BILLING_ISSUER_NAME=
BILLING_ISSUER_ADDRESS=
BILLING_ISSUER_TAX_ID=
BILLING_ISSUER_EMAIL=
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PROMPTPAY_PRICE_STARTER=price_...
STRIPE_PROMPTPAY_PRICE_PRO=price_...
STRIPE_PROMPTPAY_PRICE_ENTERPRISE=
```

Create distinct, fixed recurring THB prices in the Thai Stripe account and
enable PromptPay in its payment-method settings. Each price must match its
StayMaint plan's monthly or annual interval (interval count 1). The existing
`STRIPE_PRICE_*` card prices remain separate. The frontend reads PromptPay
amounts from Stripe; the legacy pricing page's dollar amounts are never reused
as baht prices. Leave unoffered plans blank. Prices may not be reused across
plan mappings. Set the legal business identity and branding in Stripe too so
Stripe-hosted documents and payment pages agree with StayMaint's documents.

Configure invoice emails, renewal reminders and overdue handling in Stripe's
Billing settings. Invoices have seven days until due. That payment deadline
does not itself grant seven days of access. Existing trial access can finish;
paid access ends at the last paid invoice's service-period end. There is no new
unpaid grace entitlement for this flow.

Enable these webhook events on the existing endpoint:

```text
POST /api/v1/billing/webhooks/stripe/
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
```

The first invoice is explicitly finalized after the subscription binding is
committed. Automatic invoice advancement remains enabled for subsequent billing
cycles. Repeated clicks reuse the bound subscription and invoice. If an invoice
is not ready or Stripe is unavailable, retry after refresh; do not create a
replacement subscription manually without reconciling the existing one.

## Customer experience

`/dashboard/settings/billing` provides billing identity fields, PromptPay plan
prices, invoice payment links, and Thai PDF invoices and receipts. Admins and
managers use the existing tenant authorization rules. The authenticated BFF
proxies document downloads and disables caching. Documents cannot be fetched
using another tenant's document ID. Receipt downloads require provider-confirmed
payment.

The legal issuer configuration must be complete before an invoice is created.
Customers can save their details in advance. The frontend displays an unavailable
state when issuer, Stripe key or PromptPay price configuration is missing.

## Documents and access

Migration `0101_promptpay_non_vat_documents` adds `BillingProfile` and
`BillingInvoice`. Apply it through the normal deployment process before serving
the new code. No migration is applied to the production database by the tests.

Finalized invoices freeze issuer/customer identity, amounts, line descriptions
and service periods. Editing a profile changes future invoices. Local invoice
numbers use `INV-00000001`; receipts use `RCT-00000001`. Database sequences may
have gaps, and invoice/receipt numbers intentionally use separate prefixes.
Documents state that the provider is not VAT registered. The new subscription
flow disables automatic tax and default tax rates; invoices containing VAT are
rejected rather than represented as non-VAT documents.

Only paid invoice lines for the bound Stripe subscription and mapped price can
establish access. An `active` subscription event with an unpaid invoice cannot
extend access. Stripe's exclusive service-period end is converted to StayMaint's
inclusive date in the tenant timezone. The existing DateField precision applies:
access runs through that local calendar day.

Signed webhook processing is idempotent. Invoice lifecycle handlers retrieve
the current invoice from Stripe, avoiding stale webhook status updates. The
customer's explicit refresh action also reconciles the newest 25 provider
invoices and recovers missed payments. Previously stored history is paginated
25 records at a time; this is not an unlimited import of historical Stripe data.

Existing card subscriptions must be managed first; this feature does not
silently convert them to PromptPay. Plan changes, refunds and subscription
replacement remain operator-managed through the existing billing tools. Refund
and credit-note documents are outside this implementation; a receipt records the
original payment and is not a statement that no refund occurred later. A PDF
download is not a Thai e-Tax Invoice/e-Receipt integration.

## Validation

```bash
docker compose exec -T -w /app/src backend python manage.py test \
  myappLubd.tests_promptpay_billing myappLubd.tests_stripe_billing \
  myappLubd.tests_billing_authorization --noinput --keepdb
cd frontend/Lastnext
npm run typecheck
npm run test:billing
node --test tests/billing-access.test.mjs
```

Before release, run a real Stripe **test-mode** flow with configured THB prices:
unpaid invoice → test payment → paid webhook → receipt download → next unpaid
renewal. Verify emails and PDF legal details. Live collection requires a separate
live-mode rollout and operational approval.

Stripe references:
- https://docs.stripe.com/payments/promptpay
- https://docs.stripe.com/invoicing/hosted-invoice-page
- https://docs.stripe.com/api/subscriptions/create
