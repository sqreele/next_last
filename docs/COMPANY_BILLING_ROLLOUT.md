# StayMaint Company billing — implementation and rollout

Phase 2 implements the approved **policy A**: one recurring monthly Company
invoice, with a separate Company adjustment invoice for an approved mid-cycle
addition. No production rollout, production migrations, customer conversion,
live-mode charging or Stripe catalog creation was performed during development.

## Implemented behavior

- Existing `Tenant` is the Company. Property primary keys, public IDs and
  ownership links stay in place. Existing Companies default to `legacy_plan`.
- USD is exactly 2000 cents per Property/month. One Company owns one Stripe
  Customer, one active Subscription and one quantity-based subscription item.
- PromptPay uses a separately approved fixed THB price and `send_invoice`.
  There is no automatic PromptPay debit and no automatic exchange-rate estimate.
- Preview is read only. Quotes contain exact affected Property identities,
  quantities, monthly base, amount due now, net credit and a fixed proration
  timestamp. Confirmation rechecks expiry, revision, ownership, catalog and
  provider amounts. Changed quotes require fresh consent.
- Additions remain pending until their invoice allocations are paid. Existing
  paid Properties keep their coverage. Card additions use pending updates;
  manual THB additions use local payment-gated enrollment state.
- Removal archives the Property, retains maintenance data, reduces quantity and
  applies the approved net unused-time credit on a later Company invoice. The
  final Property uses period-end cancellation. Existing paid time is retained.
- Scheduled cancellation can be reversed. Reactivating a terminal contract is
  explicitly quoted as a new contract and reuses the verified Customer. Old
  subscription IDs remain in the operation/invoice journal.
- Paid access comes from the exact Property and time interval recorded against
  a paid invoice line. A future paid interval cannot fill an unpaid gap.
  Neither provider `active` status nor a Checkout redirect grants paid access.
- Initial/additional unpaid Properties have no grace. Previously paid renewal
  coverage has configurable grace (default seven days), anchored to that paid
  interval; repeated failures never restart it. A reviewed existing trial can
  finish for initial enrollments without being extended to new additions.
- PDF invoices/receipts support USD and THB, Company identity and Property
  breakdown, exact outstanding balances, credits and immutable issued details.
  The provider is not VAT registered; these are non-VAT commercial documents.
- Company Admins manage enrollment. Property Admins have assigned-Property
  access and no billing authority unless explicitly granted billing access;
  even that read/payment capability does not permit enrollment mutations.
  Company technicians receive assigned Jobs/Equipment and cannot create work
  to grant themselves Equipment access. Legacy assignment data is not guessed.

## Files and schema

Core orchestration: `billing/company_service.py`; permissions/coverage:
`tenancy.py`, `billing/coverage.py`, `entitlements.py`; API:
`billing/company_views.py` and `billing/serializers.py`; provider events and retry
journal: `billing/reconciliation.py`; non-VAT PDFs: `billing/documents.py`.

Additive migration sequence:

| Migration | Purpose |
|---|---|
| 0101_promptpay_non_vat_documents | Earlier workspace billing identity and invoice ledger |
| 0102_company_property_billing | Company catalog, quote/operation journal, enrollments, invoice allocations, quantity fields, explicit roles and nullable Job assignment/creator fields |
| 0103_company_coverage_contract | Reference the contract responsible for paid coverage |
| 0104_company_invoice_balances | Exact due/remaining balances and signed totals for credit invoices |

No migration calls Stripe, changes existing plans, enrolls Properties, rewrites
ownership, assigns historical Jobs or promotes memberships. A historical-schema
test checks actual migration expansion and preservation of Property IDs,
ownership, Job/Room/Machine/PM links and membership grants. Historical Job
assignment and creator fields remain null until separately reviewed.

The API rejects ordinary Company/Property hard deletion, ownership reassignment
through PATCH, restricted-member self-grants and tenantless Property adoption
through import. Historical data remains readable through authorized scopes.
The general membership grant endpoint no longer discloses names of foreign
Company Properties in validation errors.

## API and UI

The existing route `/dashboard/settings/billing` contains an explicit Company
selector, overview, counts, monthly base, amount outstanding, next billing date,
Property breakdown, preview/confirmation dialogs, cancellation/reactivation,
payment-method action, invoice history and PDF downloads. Multiple authorized
Companies are never resolved by silently choosing the first one.

| Endpoint under `/api/v1/billing/` | Behavior |
|---|---|
| GET company/ | Authorized Company overview, exact balances, Property and action projections |
| POST preview/ | Quote start/add/remove/cancel/reactivate; no remote mutation |
| POST confirm/ | Confirm one scoped, actor-bound operation; durable retry identity |
| GET operation/ | Pending/completed/review status |
| GET/POST profile/ | Billing identity; changes apply to future documents |
| GET invoices/; GET document/ | Scoped invoice history and private PDF downloads |
| POST invoices/ | Explicit reconciliation/retry and invoice refresh |
| POST invoice-pay/ | Revalidated hosted invoice link |
| POST portal/ | Card payment-method-only Portal configuration |
| POST webhooks/stripe/ | Existing signature-verified provider entry point |

Cancellation and reactivation go through preview/confirm actions rather than
separate mutation endpoints. Browser requests use the authenticated BFF action
map; its server session supplies the bearer token. PDFs are private/no-store.

## Configuration — staging first

Keep these disabled until the relevant rollout approval. No secrets are copied
into this document or source control.

```dotenv
COMPANY_BILLING_ENABLED=false
COMPANY_BILLING_GRACE_DAYS=7
BILLING_RECONCILIATION_CRON_ENABLED=false
COMPANY_BILLING_PORTAL_CONFIGURATION=
BILLING_ISSUER_NAME=
BILLING_ISSUER_ADDRESS=
BILLING_ISSUER_TAX_ID=
BILLING_ISSUER_EMAIL=
```

The existing Stripe environment must contain test-mode credentials. The source
continues to reject live keys. Complete the verified legal issuer fields and
customer billing profile before enrollment. THB fixture amounts in unit tests
are test data; an approved THB amount must be configured explicitly.

Catalog commands below are for an approved staging/test database. They were
not run against production during this task. Dry-run is the default:

```bash
python manage.py setup_company_billing_prices --currency usd
python manage.py setup_company_billing_prices --currency thb --thb-unit-minor APPROVED_SATANG
```

For explicit application, use an existing verified Price or request creation
of test objects. Example USD setup:

```bash
python manage.py setup_company_billing_prices --currency usd --price-id APPROVED_TEST_PRICE_ID --apply
# Alternatively, with explicit permission to create test catalog objects:
python manage.py setup_company_billing_prices --currency usd --create --apply
```

THB additionally requires `--thb-unit-minor APPROVED_SATANG`. The command reuses
the approved Product and refuses to overwrite an existing catalog price. It
validates Product identity, test mode, currency, fixed monthly licensed price,
and USD 2000 cents. Plan prices from the legacy integration are not reused as
Company prices automatically.

Enable PromptPay in the Thai Stripe test account. Configure invoice delivery,
renewal reminders and overdue handling in Stripe. Customer payment due dates
and application access grace are separate policies.

For card updates, configure a Stripe Billing Portal configuration with payment
method update enabled and subscription update/cancellation disabled. The backend
verifies these restrictions before opening the Portal, so it cannot bypass the
application's quote/consent path.

Webhook event subscriptions:

```text
checkout.session.completed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.created
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
credit_note.created
credit_note.updated
credit_note.voided
charge.refunded
```

Credit/refund events update financial records or flag explicit credit review.
They do not automatically issue refunds or silently revoke/replace a contract.

## Reconciliation and recovery

`BillingChange` is a durable operation outbox. Company locks, actor-bound
confirmation and a partial unique constraint permit only one applying/awaiting
change per Company. Retries use the same provider idempotency keys and also
recover by operation metadata after provider key retention expires. Existing
unrelated Stripe subscriptions or open Checkouts are rejected for review.

```bash
python manage.py reconcile_company_billing                  # Local report only
python manage.py reconcile_company_billing --tenant-id PUBLIC_TENANT_ID
python manage.py reconcile_company_billing --tenant-id PUBLIC_TENANT_ID --apply
```

The apply command processes previously confirmed intent and reconciles current
provider invoices. It does not enroll legacy Companies by itself. Optional cron
runs every five minutes only with `BILLING_RECONCILIATION_CRON_ENABLED=true`.
Required environment remains in the existing root-only cron environment file;
keys are not embedded in the cron definition. Failures emit a nonzero command
exit and structured billing logs. Connect these logs to the deployment's alert
channel before release; no external alert messages were sent during development.

Timeouts keep intent blocked against a second mutation until retried/reviewed.
Resolve `quantity_drift`, `unallocated_invoice`, foreign identities, voided
adjustment invoices and credit-review states with the operation/invoice journal.
Do not guess a manifest, create replacement subscriptions manually, or reset an
operation merely to clear an error. A code or DB rollback does not reverse Stripe.

## Data-safe rollout and rollback

1. Run `audit_company_billing` read only before and after staging migration.
   It works against the old schema and fingerprints Property ownership,
   Job/Machine/Room/PM links and report IDs without exposing customer secrets.
2. Restore-test the database/media backup. Review Company legal identity, every
   Property ID, existing Customer/Subscription references and role mapping.
3. Review historical technician assignments. Initial enrollment is blocked when
   selected legacy Properties contain unassigned historical Jobs and active
   technicians. An approved mapping is required; development never fills these
   historical assignments automatically.
4. Apply expand-only migrations in staging and run tests. Production migration
   execution and image rollout require separate approval. The runtime imported
   source was `/app`; `/app/src` was used for isolated source testing. Match the
   intended image/source when executing any later operational command.
5. Configure the approved test catalog, Portal, issuer, webhook and reconciliation
   monitoring. Explicitly assign Company Admin capability through the reviewed
   membership process; do not reinterpret all old admins as Property Admins.
6. Enable the feature for the approved environment and explicitly confirm one
   Company enrollment. Companies with existing legacy provider contracts are
   blocked from automatic conversion and need a separately approved transition.
7. Prove unpaid/paid/add/remove/renewal/cancellation flows using actual Stripe
   test-mode credentials and hosted payment pages before release.

Rollback before provider mutation: disable the feature and retain the expanded
schema and all history. Existing legacy Companies continue through their old
model. Rollback after provider mutation: freeze new operations, preserve paid
coverage, reconcile the journal and obtain approval for compensating provider
actions. Do not drop payment tables, delete Properties, restore stale payment
state over current Stripe state, or assume disabling an application flag cancels
Stripe renewals. Any provider cancellation/refund remains an explicit action.

## Validation and remaining production gates

Final source validation on 2026-11-09:

| Check | Result |
|---|---|
| Company, migration, legacy Stripe/PromptPay and billing authorization DB tests | 122 passed in the isolated test database |
| Frontend test files, including PDF runtime compatibility | 57 passed |
| TypeScript and ESLint on changed Billing TS/TSX routes/components | Passed |
| Actual dashboard browser fixture at 320 / 390 / 1280px | Passed |
| Next.js production build with type checks enabled | Passed |
| Django system check, migration drift check, shell syntax and diff whitespace | Passed |
| npm audit of final lockfile | 0 critical, 11 high, 7 moderate; remaining release gate |

Provider responses in automated payment tests are deterministic mocks. These
results do not certify real hosted card/PromptPay payments or delivered webhooks;
the Stripe test-mode UAT gate below remains required. Migration preservation was
tested in an isolated database, without migrating the production database.

Review screenshots use synthetic Company data:
[desktop](company-billing-preview/desktop.png),
[mobile](company-billing-preview/mobile.png),
[proration confirmation](company-billing-preview/proration.png).

Automated coverage includes $20/$40/$60 quantity cases, net proration/credit
preview, card pending payment, manual THB payment, unpaid invoices, duplicate and
late events, provider timeout/retry, future-interval access, stale quotes,
terminal reactivation, Customer/Product reuse, multiple invoice-line pages,
negative credit invoices, foreign Companies, restricted self-grants, technician
assignment scope, private PDFs and migration preservation.

```bash
# Run from the source tree/container selected for isolated testing:
python manage.py test myappLubd.tests_company_billing \
  myappLubd.tests_company_billing_migrations \
  myappLubd.tests_stripe_billing myappLubd.tests_promptpay_billing \
  myappLubd.tests_billing_authorization --noinput --keepdb

# Frontend:
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:company-browser
STAYMAINT_LOW_MEMORY_BUILD=1 NODE_OPTIONS=--max-old-space-size=1024 npm run build
```

The browser runner uses an isolated localhost fixture harness with the actual
billing component/design system, not production authentication or financial
data. It verifies 320/390/1280px layouts, preview-without-charge, explicit consent,
pending access and restricted-role controls. Backend authorization and provider
fault tests are separate DB integration tests. CI includes both and the full build.

Build isolation uses Next's documented Webpack worker/memory options; type
checking remains enabled. Next.js was patched to 15.5.29. jsPDF was updated to
4.2.1 after reviewing its maintained API and the security release notes; Company
invoice PDFs themselves use ReportLab. Existing dependency advisories still
require a separate release assessment; no `npm audit fix --force` was run.

Before enabling production billing:

- [ ] Verified issuer identity, Company role/assignment review and approved THB price.
- [ ] Restore test, migration approval and approved per-Company enrollment manifest.
- [ ] Actual Stripe test-mode card/PromptPay hosted checkout and delivered signed webhook UAT.
- [ ] Renewal email/reminder, grace, reconciliation scheduler and alert delivery checks.
- [ ] Resolve/review remaining npm high/moderate advisories and run dependency/export compatibility checks.
- [ ] Separate deployment approval and a separately reviewed live-mode rollout. Live charging is intentionally unavailable in this implementation.

References: [Stripe quantities](https://docs.stripe.com/billing/subscriptions/quantities),
[PromptPay](https://docs.stripe.com/payments/promptpay),
[pending updates](https://docs.stripe.com/billing/subscriptions/pending-updates),
[invoice previews](https://docs.stripe.com/api/invoices/create_preview),
[Next memory controls](https://nextjs.org/docs/app/guides/memory-usage),
[jsPDF security release](https://github.com/parallax/jsPDF/releases/tag/v4.0.0).
