# StayMaint company subscriptions — Phase 1 audit and design

Date: 2026-11-09. Status: **design for approval; Phase 2 has not started**.

## 1. Decision and scope

Extend the existing `Tenant` as the Company boundary, and keep `Property.tenant`
as its ownership relationship. Keep both `Property.id` and public `property_id`,
all maintenance relationships, existing membership grants, existing provider
IDs, and legacy subscription plans. A separate Company ownership table would
create competing tenant boundaries without adding business value here.

The proposed commercial model is one Company → one Stripe Customer → one active
Subscription → one licensed subscription item with a monthly per-property price.
USD recurring base total is `2000 minor units × billable property quantity`.
PromptPay uses a separately approved, fixed THB unit price. Customer-visible
Company fields can project existing Tenant/Subscription fields without storing
two independently editable copies of a Stripe Customer ID or billing status.

This audit created documentation only. It did not modify application code,
apply migrations, change plans, assign properties, contact Stripe APIs, push,
deploy, or charge customers. Earlier uncommitted PromptPay/document work and
unrelated Demo edits remain in the workspace and are not assumed deployed.

## 2. Evidence and current architecture

### Production observations, read only

The runtime was inspected using `docker compose exec ... manage.py shell`, with
database reads inside a PostgreSQL transaction explicitly marked
`SET TRANSACTION READ ONLY`. No customer names, email addresses, credentials or
provider IDs were printed.

| Observation | Result |
|---|---|
| Runtime model module | `/app/myappLubd/models.py` |
| Mounted working source | `/app/src`; differs from the runtime import location |
| Companies represented by Tenant | 1 |
| Properties | 2 |
| Properties without a Tenant | 0 |
| Property distribution | Both properties belong to the same Tenant |
| Local subscriptions with nonempty Stripe Subscription ID | 0 |
| Stripe secret configured | Yes; test-mode prefix only, value not exposed |
| Subscription enforcement | `observe` |
| Latest applied app migration | `0100_daily_summary_recipients` |
| Local billing invoice table | Absent |

These are local database observations, not an inventory of the Stripe account.
No absence of Stripe-side customers or orphan subscriptions is inferred. The
Company's legal identity, existing property-to-company mapping, consent to the
new price, and existing access grants still require verification before rollout.
No regrouping of the two properties is needed for the proposed schema.

### Repository architecture

| Layer | Existing implementation and evidence |
|---|---|
| Backend | Django 4.2, DRF, PostgreSQL; `backend/myLubd/requirements.txt` |
| Frontend | Next.js 15, React 18, TypeScript, Tailwind, shared Card/Button/Input components; `frontend/Lastnext/package.json` |
| Authentication | Auth0 server session → authenticated Next BFF → backend bearer token. `auth.py` validates RS256, issuer and audience and binds external identity. Legacy local application JWT is gated to opted-in debug mode. |
| Company boundary | `models.py::Tenant`: ID, public tenant ID, name, owner, billing email, timezone, status and timestamps |
| Ownership | `models.py::Property`: existing integer ID and public Property ID; nullable `tenant` FK; canonical Jobs, Rooms and Machines refer to Property |
| Roles | `TenantMembership`, role enum and optional Property M2M; platform roles separate in `PlatformMembership` |
| Access querysets | `tenancy.py::get_accessible_properties`, `get_operable_properties`, `get_billing_tenants` |
| Commercial model | `SubscriptionPlan`: starter/pro/enterprise and limits/capabilities, including max_properties and multi_property |
| Contract | One `TenantSubscription` per Tenant, unique non-null external customer/subscription IDs, plan, date-only periods, trial/grace deadlines and cancellation flag |
| Stripe | Python SDK `>=12.5.1,<13.0`; Checkout subscription mode, Customer reuse and Billing Portal in `billing/stripe_service.py` |
| Webhooks | Raw-body signature verification, durable event uniqueness, locking, retryable failed events and transactional dispatch |
| Entitlements | `entitlements.py`: FULL/GRACE/READ_ONLY; `subscription_permissions.py`: off/observe/enforce |
| Billing API | `/api/v1/billing/checkout/`, `portal/`, `webhooks/stripe/`; normalized `/tenant-subscriptions/entitlement/` |
| Billing UI | `/dashboard/settings/billing`; `/dashboard/billing` compatibility route; authenticated `/api/billing/[action]` BFF |
| Invitations | Existing TenantInvitation, capacity checks and membership/property grant helpers |

### Earlier workspace changes that must be integrated, not duplicated

Uncommitted `billing/promptpay.py`, `billing/documents.py`, `BillingProfile`,
`BillingInvoice`, migration `0101_promptpay_non_vat_documents`, `BillingDocuments.tsx`
and associated routes/tests provide a first non-VAT PromptPay flow. They are
plan-based, assume effectively one subscription unit, and do not solve property
quantity billing. The production database has not received migration 0101.
Retain these files as a baseline and revise them under Phase 2; do not add a
second invoice ledger or silently apply their migration now.

## 3. Gaps and security findings

These are repository inspection findings unless explicitly labeled runtime
observations. No destructive or exploit requests were made against production.

| Priority | Finding and evidence | Required treatment |
|---|---|---|
| Release blocker | Card Checkout sets `quantity: 1`; PromptPay create omits quantity. `TenantSubscription` stores neither item ID nor billed quantity. | Add Company quantity authority and persist provider item/price/quantity. |
| Release blocker | Property CRUD does not update Stripe or stage access. Existing create/import checks use legacy max_properties and multi_property gates. | Route all new-model enrollment changes through preview/confirm and one mutation service; guard alternate create/import paths. |
| Release blocker | `PropertyViewSet.add_user` and `assign_properties` let a restricted member add/change their own Property grants inside their Tenant. | Remove self-grant authority; only Company-authorized membership administrators can grant access. Same-company Property isolation is otherwise bypassable. |
| Release blocker | `PropertyViewSet` has only IsAuthenticated plus accessible-object lookup; update is inherited, and `PropertySerializer.tenant` is writable without target-company validation. | Forbid ownership changes through ordinary PATCH/PUT; require explicit mutation permission. Treat existing-Property transfers as a separate approved process. |
| Release blocker | `TenantViewSet` and `PropertyViewSet` expose inherited deletion without a dedicated Company-admin deletion rule. Some PROTECT FKs may block deletion, but they do not supply authorization. `Property.tenant` uses CASCADE. | Reject ordinary hard deletion; archive billing/operational state; explicitly protect Company deletion and audit admin paths. |
| High | Billing is available to legacy `admin` and `manager`; these roles are Tenant-wide. `owner`/`billing` are excluded by the current billing-role set, despite other management helpers using them. | Introduce explicit Company Admin/Property Admin semantics and billing capability; never interpret every legacy admin as Property Admin. |
| High | Jobs and Machines are filtered primarily by accessible Property. Job assignee filtering is an optional query parameter; `Job.user` conflates legacy creator/assignee usage. | Add mandatory assignment-aware technician scope and a clear assignment representation; cover details, exports, attachments and reports. |
| High | Subscription `active` drives legacy card access from provider periods; the workspace PromptPay paid-line guard tracks dates but not purchased quantity or exact Property identities. | Separate provider status, paid coverage and Property access; a paid line for two units cannot unlock a third Property. |
| High | Runtime enforcement is observe-only. Invalid enforcement configuration falls back to off. | Explicit staged enforcement, configuration validation and per-Company opt-in; no global switch during this phase. |
| High | Grace is hard-coded to seven days on card failure; manual invoices receive no configured grace policy. | Configurable renewal grace, anchored once; first payments and new Property additions do not receive unpaid access. |
| High | Customer create has idempotency but Checkout session create has no durable operation record; manual-subscription key is static per local subscription. | Operation IDs and recovery/reconciliation across timeouts, retries, cancellations and later reactivation. Stripe idempotency alone is not a permanent deduplication ledger. |
| High | Subscription-created/updated events can apply their payload directly; unique event IDs do not prevent distinct older events overwriting newer state. | Retrieve authoritative current objects and reconcile revisions/paid coverage; test reordered events. |
| High | Remote calls occur inside some DB transactions; no dedicated billing outbox/reconciliation worker was found. | Short Company locks plus durable operations/outbox and retry/recovery; no presumed atomicity between PostgreSQL and Stripe. |
| Medium | BillingSettingsClient chooses the first authorized Tenant (`rows(...)[0]`). | Explicit authorized Company selector; no inferred Company when issuing charges. |
| Medium | Local invoice snapshots support THB only; card invoice PDF/history is delegated to Stripe and does not share the same ledger. | Consolidated invoice service for USD and THB; immutable per-Property breakdown and payment/credit history. |
| Medium | DateField periods cannot represent Stripe's exact exclusive timestamp boundaries. | Add UTC timestamp coverage, preserve legacy date projections for old callers. |
| Medium | No dedicated self-service cancellation/reactivation endpoints or per-Property billing lifecycle exist. | Explicit lifecycle operations and archive behavior; terminal Stripe cancellations require a new approved contract. |
| Medium | CI backend selection omits the billing/security suites examined here. | Add Company billing, webhook, RBAC and preservation regressions to CI. |

Permission remediation belongs before self-service charging. These findings do
not establish an active breach. Existing server-token forwarding, canonical
tenant filters, signature verification and durable webhook receipts should be
retained rather than replaced.

## 4. Proposed schema

All names below are proposed Phase 2 changes. Legacy rows remain in
`legacy_plan` mode until explicitly reviewed and enrolled.

| Model | Proposed data and constraints |
|---|---|
| **Tenant = Company** | Keep existing IDs/name/billing_email/timestamps. Add `billing_currency` (USD/THB, nullable until configured) and `billing_model` (`legacy_plan`, `property_quantity_v1`, default legacy). API `stripe_customer_id` projects `subscription.external_customer_id`; `billing_status` projects normalized contract/payment state. No duplicate independently writable customer/status fields. |
| **Property** | Keep ownership FK and all IDs. Add nullable `activated_at`, `archived_at`, updated timestamp, and a billing/access status projection. Do not default existing rows to chargeable or change tenant links. Archived records remain readable to authorized users. |
| **TenantSubscription = CompanySubscription** | Retain one Company contract and external IDs. Add nullable unique `stripe_subscription_item_id`, `stripe_price_id`, `billing_quantity` (confirmed provider quantity), `desired_quantity`, `paid_quantity`, `collection_method`, `payment_method_type`, provider UTC period timestamps, `paid_through_at`, `reconciliation_status`, and monotonically increasing billing revision. Existing DateFields remain compatibility projections. All provider/payment fields server-owned. |
| **BillingPrice** | Approved catalog keyed by model version/currency/collection method: provider product/price IDs, integer unit amount, monthly interval, active flag and test/live mode. USD amount must be 2000. THB amount must be explicitly approved. Validate immutable provider price properties before enrollment. |
| **PropertyBillingEnrollment** | Tenant, Property (PROTECT), Subscription (PROTECT), requested/effective start/end, state (`unreviewed`, `pending_payment`, `billable`, `pending_removal`, `inactive`), operation/revision reference. Constraint: one effective enrollment per Property; Company must match Property. Exclude archived/unreviewed rows from chargeable quantity. |
| **BillingChange** | UUID operation ID, Company/actor, action, before/after property manifests and quantities, expected revision, price/currency, quote amounts and lines, fixed proration timestamp, expiry, confirmation/processing state, provider invoice/item IDs, durable idempotency keys and error/retry metadata. At most one applying change per Company. |
| **BillingInvoice** | Extend the earlier workspace ledger for USD and THB, provider item/subscription identity, revision, quantity and unit-price snapshots, integer totals, invoice purpose (`renewal`, `adjustment`), issuer/customer snapshots, payment/refund/credit references and timestamps. Preserve existing document numbers and immutable identity/line details. |
| **BillingInvoiceAllocation** | Exact Property IDs, invoice line ID, billed/credited service interval, unit share, manifest revision and coverage/payment status. Invoice-paid activates only these approved allocations, not today's live Property count. |
| **BillingWebhookEvent** | Keep provider/event ID uniqueness and processing receipts; add relevant Company/object references and reconciliation diagnostics. Do not store secrets or unrestricted payment payloads. |
| **Membership capabilities** | Add explicit `company_admin` and `property_admin` role choices and a controlled billing permission. Keep existing roles/grants unchanged. Property Admin is restricted to assigned Properties; technician cannot receive billing access. New-company permissions are explicit; legacy changes need an approved role map. |
| **Job assignment** | Add a canonical `assigned_to` representation (and immutable creator attribution where absent), keeping legacy `user`. Never guess historical assignments from `user` without a reviewed mapping. Define equipment access through assigned Jobs plus approved Property/equipment grants. |

`billing_quantity` must equal the effective billable manifest at steady state.
`desired_quantity` records a confirmed change in flight; it must never be shown
as already paid capacity. For card pending updates, old effective quantity is
retained until payment applies the change. For manual invoices, Stripe can
reflect the new requested quantity before payment; those new enrollments remain
pending_payment and have no access. Expose this temporary difference explicitly,
with the operation and invoice responsible, and reconcile it before admitting
another mutation. Do not claim distributed updates happen atomically.

Exact Property allocations are necessary even if two Companies happen to have
the same quantity: replacing a Property must not reuse another Property's paid
coverage without an approved change.

## 5. Stripe design and commercial policy

### Pricing and collection

Inspect or create the **test-mode** Product `StayMaint Property Subscription`
through an idempotent setup command. Match configured IDs and immutable price
properties; a matching product name alone is not sufficient. Create/reuse a
licensed, fixed monthly USD Price of 2000 cents, quantity N. Use one Customer and
one active Subscription for each Company. Existing bindings are reused only
after validating their identities; never overwrite them to fit the new model.
This follows Stripe's supported quantity model and produces one recurring
Company invoice. [Stripe quantities](https://docs.stripe.com/billing/subscriptions/quantities)

Cards use `charge_automatically`. PromptPay uses a fixed, explicitly configured
THB Price and `send_invoice`; it requires the customer to authorize each QR
payment. Checkout subscription mode is not the PromptPay entry point. The active
contract has one currency; USD and THB cannot be mixed into its consolidated
invoice. Switching between USD cards and THB PromptPay is a separately quoted,
approved contract transition after outstanding invoices are reviewed. No FX
estimate is represented as a guaranteed THB amount.
[Stripe PromptPay](https://docs.stripe.com/payments/promptpay)

Preserve the previously stated non-VAT document policy. Disable automatic tax
and tax rates for this flow, retain legal issuer/customer details and receipt
numbering, and handle invoice credits/refunds explicitly. Do not relabel a
payment receipt as a Thai VAT tax invoice.

### Preview and confirmation

Recommended policy for approval:

| Action | Proposed behavior |
|---|---|
| Initial enrollment | One Company invoice, N units, USD $20 × N or approved THB unit × N. Property access pending until paid, subject to an explicitly preserved existing trial. |
| Add during a paid cycle | Preview the prorated increment and next recurring base. After confirmation, create a Company adjustment invoice, not one subscription per Property. New Property access starts only after that adjustment is paid. |
| Remove during a paid cycle | Preview credit for paid unused time; stop the affected Property's operational access and preserve history. Reduce effective quantity and carry approved credit to the next Company invoice; no automatic cash refund. |
| Outstanding unpaid invoice | Block quantity/price changes until resolved or explicitly reconciled. Do not issue unused-time credit for service that was never paid. |
| Remove final Property | Confirm cancellation policy and stop future renewal at the chosen effective boundary. Preserve history and any outstanding debt. Do not silently leave a charged minimum-one subscription. |
| Cancel/reactivate | Default cancel at period end and preserve paid access until its boundary. Undo a scheduled cancellation before that boundary; after a terminal cancellation, explicitly create a new contract with a new operation ID. |

The requirement for one consolidated **monthly** invoice is compatible with a
Company-wide mid-cycle adjustment invoice, but this means more than one document
can exist in a month. If the intended policy is exactly one invoice per month,
use scheduled additions/removals at renewal and activate new Properties only
when their renewal coverage is paid. **This policy choice must be approved before
Phase 2 charging flows are finalized.** No immediate charging is authorized by
approval of this design alone.

The server derives quantities from authorized manifests, not client numbers.
Persist a short-lived quote with operation ID, Company, actor, manifest revision,
currency/price, exact `proration_date`, amounts and expiry. Confirm checks these
again under a Company lock and rejects changed or expired quotes (409). Use the
same proration timestamp for the provider preview and update; re-preview and
require fresh consent when material inputs differ.
[Stripe invoice previews](https://docs.stripe.com/api/invoices/create_preview)

For cards, use provider-supported payment-pending updates where compatible,
with local pending access and recovery for payment authentication/failure.
PromptPay `send_invoice` must use the local operation/coverage state machine;
Stripe's pending-update collection-method prerequisite is
`charge_automatically`. It cannot be assumed to protect a manual-invoice update.
[Stripe pending updates](https://docs.stripe.com/billing/subscriptions/pending-updates)

Negative credits and unpaid invoices require deliberate treatment; provider
proration calculations can otherwise credit unpaid service. Monthly recurring
base and the actual invoice amount due (prorations/credits included) are separate
dashboard values. Thus two Properties have a $40 recurring base even when a
credit changes that particular invoice's amount due.
[Stripe prorations](https://docs.stripe.com/billing/subscriptions/prorations)

### Webhooks, reconciliation and grace

Retain the current signature verification and durable unique event receipts.
Support checkout.session.completed, invoice.created/finalized/paid/payment_failed,
invoice.voided/marked_uncollectible, customer.subscription.created/updated/deleted,
and applicable pending-update/Checkout-expiry events. Payment action-required,
refund and credit-note events must also reconcile their related records.

Before applying anything: validate live/test mode, Company/customer/subscription/
item/price/currency identity; retrieve current authoritative objects; correlate
invoice purpose and exact manifest revision. A recurring invoice must use the
manifest effective when it was created, captured by a versioned operation and
provider metadata snapshot, never a later live count. Verify that metadata and
line snapshot contract against the installed SDK/API version during Phase 2;
quarantine invoices without a provable allocation rather than guessing.

Acknowledging a Checkout redirect or seeing `active` is insufficient to grant
paid access. Partial payments do not activate additional units prematurely.
Duplicate events, distinct events for the same invoice, and late events cannot
extend coverage, reset grace, resurrect cancellations or reverse credits.

Proposed configurable defaults: initial/new-Property grace = 0; renewal grace =
7 days for previously paid Properties, starting once at the paid-through
boundary. Customer payment deadline and access grace are separate values.
Repeated failures must not restart grace. At expiry, operational writes stop;
Company billing recovery and authorized historical reads remain available.

Use an outbox/retry journal and reconciliation command driven by the existing
scheduler deployment. Do not introduce an unprovisioned queue dependency. A
webhook can enqueue after verified durable acceptance; worker retry and poison
event alerts must be proven. Reconcile quantity, outstanding invoices, scheduled
changes and paid allocation differences, rather than blindly overwriting either
side. Neither a database rollback nor an application rollback reverses Stripe.

## 6. API design

Keep existing `/api/v1/billing/` and Tenant public ID conventions. Present Tenant
as Company in UI/API DTO labels; do not add a competing ownership namespace.
Every endpoint explicitly authorizes the requested Company and action. The BFF
accepts only mapped operations and uses its server session bearer token.

| Method and path | Contract |
|---|---|
| GET `/api/v1/tenants/billing/` | Authorized Companies and capabilities for selector |
| GET `/api/v1/billing/company/?tenant_id=...` | Overview, counts, legacy/new model, exact currency/unit/base/due amounts, payment method, provider/access statuses, dates, capabilities and pending changes |
| GET `/api/v1/billing/properties/?tenant_id=...` | Scoped Property breakdown and effective/pending/paid enrollment status |
| POST `/api/v1/billing/preview/` | Company, action, Property identities or new-Property draft, selected method/price option; returns server-owned quote and operation ID. No Stripe mutation. |
| POST `/api/v1/billing/confirm/` | Quote ID, expected revision and idempotency token; verifies consent and applies/enqueues the exact operation; returns 202 pending or completed projection. |
| GET `/api/v1/billing/operation/?tenant_id=...&operation_id=...` | Durable status, payment/retry action and safe error; never a raw provider payload |
| POST `/api/v1/billing/payment-method/` | Card setup/Portal action with authorized capabilities; currency changes require a separate preview/confirm operation |
| POST `/api/v1/billing/cancel/` | Previewed, confirmed period-end cancellation; never deletes Properties |
| POST `/api/v1/billing/reactivate/` | Undo scheduled cancellation or quote a new contract after terminal cancellation |
| GET `/api/v1/billing/invoices/` | Paginated consolidated USD/THB invoice history and immutable breakdown |
| GET `/api/v1/billing/document/` | Authorized PDF; receipt only after confirmed payment; private/no-store |
| POST `/api/v1/billing/invoice-pay/` | Revalidated payable hosted invoice link, suitable for manual PromptPay |
| GET/POST `/api/v1/billing/profile/` | Company billing identity; edits apply to future documents |
| POST `/api/v1/billing/webhooks/stripe/` | Existing signature-only provider entry point; not exposed through the browser BFF |

Ordinary `/properties/` creation/import may create nonbillable drafts under
Company Admin authority. It must never bypass enrollment confirmation. Ordinary
Property PATCH cannot accept tenant, payment, activation or quantity fields.
Existing Property assignment across Companies remains a separately reviewed
operator workflow; it is not implemented as part of Add Property.

Use 400 for validation, 403 for denied capabilities, 404 for inaccessible
resources, 409 for stale quotes/conflicts, and recoverable provider-unavailable
responses. Do not accept arbitrary Stripe price/customer/item IDs or amounts
from the browser.

## 7. Dashboard and RBAC design

Reuse `/dashboard/settings/billing`, shared components and authenticated BFF.
Provide loading/error/empty/payment-pending states at desktop and mobile widths.

```text
Company selector                         Billing status / payment action
Company name | Total | Active | Billable | Pending Properties

Monthly billing
USD $20 per Property × 2 = $40/month
Method: Card    Next invoice: ...    Amount due now / credits: ...

Property                 Access / billing state      Monthly base
Hotel Siam               Active / paid               $20
Hotel Chinatown          Active / paid               $20
Total                                                 $40

Add Property  Manage Properties  Update payment method
Invoice history / PDF    Cancel or reactivate subscription
```

Confirmation dialog shows affected Properties, old/new quantity, prorations,
credits, amount due now, new monthly base, effective date, currency, payment
method and activation consequence. Pending rows do not look Active. A $20 price
label is always explicitly USD; PromptPay shows its approved THB unit price.
Historical invoice breakdown never changes when Properties are renamed later.

| Role | Company billing | Property management | Operational access |
|---|---|---|---|
| Company Admin | Consolidated overview, invoices, changes and cancellation | All Company Properties; controlled invitations/grants | All authorized Company data |
| Property Admin | None unless explicitly granted billing authority | Assigned Properties only; cannot transfer ownership or self-grant more Properties | Assigned Properties |
| Technician | None | No Company enrollment or grant changes | Assigned Jobs and their permitted Equipment, within explicit Property grants |
| Platform roles | Existing explicit break-glass/support policies | Audited exceptions | No implicit authority from is_staff |

Derive capabilities on the backend and return them in the profile/Company DTO;
navigation visibility is only presentation. Preserve legacy grants by default
and require an approved role matrix before converting existing memberships.

## 8. Exact expected Phase 2 file set

Paths are relative to the repository. New-file names below are reserved design
names; migration numbers assume no intervening migrations. Do not renumber or
apply an already-applied migration.

### Backend files to modify

- `backend/myLubd/src/myappLubd/models.py`: additive Company/property/subscription/operation/allocation schema and role choices.
- `backend/myLubd/src/myappLubd/tenancy.py`: canonical capabilities, safe Property grants, model-aware quantity/limit authority and assignment scope.
- `backend/myLubd/src/myappLubd/serializers.py`: Company projections, read-only billing/ownership fields and canonical assignment serializers.
- `backend/myLubd/src/myappLubd/views.py`: Property/Tenant mutation authorization, no hard delete, controlled import/create/enrollment and technician read/write scope.
- `backend/myLubd/src/myappLubd/entitlements.py`: exact paid allocation and grace decisions with legacy compatibility.
- `backend/myLubd/src/myappLubd/subscription_permissions.py`: Company/Property coverage enforcement and safe configuration behavior.
- `backend/myLubd/src/myappLubd/plan_capabilities.py`: new model support without legacy max_properties/multi_property blocking purchases; retain unrelated quotas pending policy approval.
- `backend/myLubd/src/myappLubd/billing/permissions.py`: explicit Company capabilities.
- `backend/myLubd/src/myappLubd/billing/stripe_service.py`: quantity/subscription item identity, paid card/manual coverage and fresh-state event reconciliation.
- `backend/myLubd/src/myappLubd/billing/promptpay.py`: THB quantity and manual payment operations.
- `backend/myLubd/src/myappLubd/billing/documents.py`: USD/THB consolidated immutable invoices, allocations and credit handling.
- `backend/myLubd/src/myappLubd/billing/views.py`: overview, quote/confirm, lifecycle and operation endpoints.
- `backend/myLubd/src/myappLubd/urls.py`: explicit new routes.
- `backend/myLubd/src/myappLubd/admin.py`: prevent bypass via direct billing/ownership edits; audited review controls.
- `backend/myLubd/src/myappLubd/platform_api.py`: new status/quantity/reconciliation projections without raw secrets.
- `backend/myLubd/src/myLubd/settings.py`: test catalog, model flag, quote TTL, grace/proration policy, explicit validated enforcement settings.
- `backend/myLubd/entrypoint.sh`: documented opt-in billing reconciliation schedule only; no unapproved production enablement.

### Backend files to add

- `backend/myLubd/src/myappLubd/billing/company_service.py`: operation orchestration and Company quantity invariants.
- `backend/myLubd/src/myappLubd/billing/quotes.py`: provider previews, revision/expiry validation and confirmation.
- `backend/myLubd/src/myappLubd/billing/reconciliation.py`: durable retry/outbox processing and discrepancy reporting.
- `backend/myLubd/src/myappLubd/billing/serializers.py`: request/response validation independent of legacy model serializers.
- `backend/myLubd/src/myappLubd/management/commands/audit_company_billing.py`: read-only inventory/checksums and enrollment proposal.
- `backend/myLubd/src/myappLubd/management/commands/setup_company_billing_prices.py`: explicit test-only catalog setup; execution separately controlled.
- `backend/myLubd/src/myappLubd/management/commands/reconcile_company_billing.py`: safe report mode by default; explicit operation processing mode.
- `backend/myLubd/src/myappLubd/migrations/0102_company_billing_schema.py`: additive fields/tables after workspace migration 0101.
- `backend/myLubd/src/myappLubd/migrations/0103_company_property_roles.py`: additive role/assignment support and constraints, no bulk role/Property reassignment.

Review every Job/Equipment export, attachment, AI and report endpoint using
direct querysets when applying technician restrictions. The exact additional
consumer files, if needed, must be recorded before changing them; the files above
are the identified billing implementation set, not a claim that uninspected
operational consumers are already safe.

### Frontend files to modify/add

- Modify `frontend/Lastnext/app/dashboard/settings/billing/BillingSettingsClient.tsx`.
- Modify `frontend/Lastnext/app/dashboard/settings/billing/BillingDocuments.tsx`.
- Modify `frontend/Lastnext/app/dashboard/settings/billing/success/BillingSuccessClient.tsx`.
- Modify `frontend/Lastnext/app/api/billing/[action]/route.ts` and add explicit operation routes only if the action map needs expansion.
- Modify `frontend/Lastnext/app/dashboard/properties/page.tsx` and the existing `app/api/properties/route.ts`, `app/api/properties/[propertyId]/route.ts` to support permitted draft/archive actions.
- Modify `frontend/Lastnext/app/lib/billing-access.mjs`, `billing-access.d.mts`, `billing-access.server.ts`, `billing-ui.mjs`, `billing-ui.d.mts`.
- Modify `frontend/Lastnext/app/lib/hooks/useBillingAccess.ts`, `usePlanCapabilities.ts`, `frontend/Lastnext/app/lib/profile.ts`, and `frontend/Lastnext/app/lib/i18n/dictionary.ts` for explicit capabilities and translated billing labels.
- Add `frontend/Lastnext/app/dashboard/settings/billing/CompanyOverview.tsx`, `PropertyBillingTable.tsx`, `BillingChangeDialog.tsx` and `useCompanyBilling.ts`.

### Tests and operational documentation

- Add backend `tests_company_billing.py`, `tests_company_billing_operations.py`, `tests_company_billing_webhooks.py`, `tests_company_billing_migrations.py` under `backend/myLubd/src/myappLubd/`.
- Extend existing `tests_stripe_billing.py`, `tests_promptpay_billing.py`, `tests_billing_authorization.py`, `tests_tenant_authorization_hardening.py`, `tests_job_write_authorization.py`, `tests_usage_limits.py`, `tests_tenant_invitations.py` and `tests_platform_api.py`.
- Extend frontend `tests/billing.test.mjs`, `billing-access.test.mjs`, `billing-documents-route.test.mjs`; add `tests/company-billing.test.mjs` and `tests/company-billing.e2e.spec.ts` with an isolated authenticated fixture setup.
- Modify `.github/workflows/ci.yml`, `docs/PROMPTPAY_BILLING.md`, `DEPLOYMENT.md`; add `docs/COMPANY_BILLING_ROLLOUT.md` with manifests, review gates and recovery procedures.
- Preserve `backend/myLubd/requirements.txt` unless the installed Stripe SDK lacks a verified necessary API; any version change must be deliberate and tested rather than copying latest-doc examples blindly.

## 9. Migration, compatibility and rollback

1. **Snapshot and verify**: read-only inventory of Company/Property IDs, every
   Property ownership FK, membership grants, Jobs/Rooms/Machines/PM/Reports,
   current provider bindings and existing catalog. Capture row counts and
   deterministic hashes; take and restore-test a backup before deployment.
   Separately approve any production Stripe read access and enrollment mapping.
2. **Expand only**: retain unapplied 0101, then additive 0102/0103. Existing
   billing_model defaults to legacy, new enrollment unreviewed, provider fields
   nullable. No migration assigns Properties, rewrites plans, creates Stripe
   objects, copies guessed payment dates or grants broader roles.
3. **Deploy disabled, only after separate approval**: application supports both
   schemas; new-model charging remains off. Run validation against migrated
   staging data; migration execution is not approved by Phase 1/2 coding consent.
4. **Test enrollment**: verified Company identity, explicit USD/THB price and
   reviewed Property manifest. Reuse valid customer binding. Quarantine conflicts
   and remote orphan/duplicate subscriptions rather than recreating customers.
5. **Explicit opt-in**: a per-Company migration/enrollment operation with the
   agreed start date, legacy contract treatment and customer consent. Do not run
   a global migration of current customers to $20/property.
6. **Observe then enforce**: compare desired/provider/paid quantities and grants.
   Enable new Property access enforcement only after parity tests and approval;
   preserve billing recovery and historical reads.

Rollback before remote mutation: disable the feature, revert the application to
a compatible release, retain additive tables and all records. Never reverse
schema migrations by dropping invoice/payment history in production. Existing
legacy subscriptions continue through their established paths.

Rollback after a Stripe mutation: freeze further operations, reconcile their
journal, preserve paid access, and propose explicit compensating provider
actions. Application rollback does not cancel an invoice, undo a debit or restore
remote quantity. Refunds, voids, credit notes and subscription replacement need
separate approval. Do not blindly restore a stale database over live payments.

Acceptance requires unchanged existing Property IDs, ownership and operational
record links. Any required cross-Company transfer or legacy assignment backfill
has its own reviewed manifest and explicit approval; none is presumed here.

## 10. Phase 2 implementation sequence

1. Approve design, billing/credit/grace/zero-Property policies, THB unit price and
   the distinction between one recurring invoice and adjustment invoices.
2. Add regression tests for the observed role/self-grant/ownership weaknesses;
   implement capabilities and close alternate mutation paths.
3. Add additive schema and legacy compatibility; test migrations on a copy.
4. Implement the approved test-mode catalog, Company manifests and durable quote/
   operation model. Validate USD $20 as exactly 2000 cents.
5. Implement card quantity checkout/updates and manual THB invoices with payment-
   gated per-Property coverage, accurate proration and retry/recovery.
6. Extend invoice snapshots, signed webhooks, outbox/reconciliation, credits and
   configurable renewal grace; test event ordering and partial payments.
7. Implement the responsive dashboard, Company selector and consent dialogs.
8. Run unit, DB integration, migration, Stripe test-mode contract and browser
   tests; typecheck, lint and production build under documented resource limits.
9. Provide code diff, results and rollout/rollback pack for review. Stop before
   push, production migration, deployment, live-mode configuration or charging.

## 11. Automated test plan and evidence status

No new tests were run during this read-only Phase 1 audit. The earlier workspace
iteration passed 80 backend billing/authorization tests and frontend checks;
those results do not establish the new quantity model or production readiness.
One full build passed with a constrained Node heap; the latest subsequent build
compiled but exited 137 during type validation. A reproducible full build is
still a release gate. Existing CI does not currently enforce these billing suites.

| Requested scenario | Automated Phase 2 acceptance |
|---|---|
| 1. One Company, one Property | One Customer/Subscription/item, quantity 1, recurring base USD 2000 |
| 2. One Company, two Properties | Quantity 2, base USD 4000, one recurring invoice with exact two-Property manifest |
| 3. Add third | Preview 2→3, confirmed operation and quantity 3, base USD 6000; third access only after paid allocation |
| 4. Remove one | Confirm 3→2, base USD 4000; configured credit/effective date shown; history intact |
| 5. Mid-cycle addition | Stripe preview/update share timestamp; exact minor-unit totals; immutable adjustment allocation |
| 6. Successful card | Real Stripe test-mode payment plus signed webhook applies exact paid capacity; redirect alone does nothing |
| 7. Failed card | Decline/3DS pending never enables new Property; renewal grace starts once and expires at configured time |
| 8. Successful PromptPay | Explicit THB quantity price, send_invoice, provider-confirmed payment and receipt; no automatic off-session charge |
| 9. Unpaid PromptPay | Active provider status does not grant an unpaid initial/additional Property; paid existing coverage/grace handled separately |
| 10. Duplicate webhook | Same event and different events for one invoice do not duplicate coverage, invoices, credits or operations |
| 11. Unauthorized billing | Property Admin/technician/legacy role variations cannot create quotes, confirm, cancel, download or self-grant outside capability |
| 12. Company isolation | Company A cannot enumerate/read/pay/mutate Company B via IDs, quotes, pagination, PDF, Portal or webhooks with mismatched references |
| 13. Data preservation | Pre/post IDs, owner FK hashes, grants and Jobs/PM/Equipment/Room/Report links equal; no delete/reparent side effects |

Additional mandatory cases: concurrent adds/removals, stale/expired quotes,
outstanding unpaid invoice credit prevention, last Property removal, scheduled
cancellation/terminal reactivation, API timeout after remote success, process
crash/retry, provider quantity drift, currency switching, refund/credit-note
events, negative/zero amounts, more than one page of invoice lines, invoice
created during an enrollment mutation, renewal paid after a newer adjustment,
foreign-company membership grants, forged billing fields, and legacy-mode parity.

Tests must mock provider faults deterministically and also run opt-in Stripe
test-mode contract tests. Test clocks/fixtures should be used where supported.
No live keys or production customer payment instruments are used.

## 12. Production readiness gates

- [ ] Approved Company identity and Property manifest; no implicit transfers.
- [ ] Approved $20 USD catalog and fixed THB amount; currency transition policy.
- [ ] Approved proration, adjustment-invoice, removal, last-Property, grace,
      cancellation, refund and credit policies.
- [ ] Reviewed legacy roles and technician assignment representation.
- [ ] Permission/self-grant/ownership/deletion regressions fixed and tested.
- [ ] Existing unrelated quotas/features agreed; new property purchases cannot
      be blocked accidentally by the old plan model.
- [ ] Expand-only migrations tested and backup restore demonstrated.
- [ ] Signature, idempotency, concurrent operations, stale events and recovery
      tested against the pinned SDK/API version.
- [ ] Exact paid Property allocations, money calculations and document identities
      verified for both currencies; non-VAT policy preserved.
- [ ] Reconciliation scheduler, retry limits, alerting and orphan-payment runbook
      provisioned and exercised.
- [ ] All 13 scenarios plus concurrency/security/browser tests pass in CI.
- [ ] Full production build reproducibly passes with recorded resource settings.
- [ ] Invoice delivery, reminders, renewal timing and customer support recovery
      verified in Stripe test mode.
- [ ] Separate approval for deployment/migration and per-Company cutover.
- [ ] Separate live-mode plan and explicit authorization; current test-only guard
      is not removed as part of routine implementation.

**Phase 1 stops here. Phase 2 implementation requires explicit user approval.
That approval does not authorize pushing, deployment, production data changes,
Stripe live-mode setup or charging.**
