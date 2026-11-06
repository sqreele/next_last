# StayMaint Pricing & Commercial Readiness Audit

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

## Runtime plan configuration (VERIFIED)

| Plan | Monthly price | Users | Properties | Jobs/month | PM schedules | Assets | Storage |
|---|---:|---:|---:|---:|---:|---:|---:|
| Basic (`starter`) | USD 15 | 4 | 1 | 500 | 100 | 250 | 10 GB |
| Pro | USD 30 | 10 | 1 | 500 | 100 | 250 | 10 GB |
| Enterprise | USD 60 | 50 | 5 | 500 | 100 | 250 | 10 GB |

Evidence: read-only query of `SubscriptionPlan`; migrations `0089_update_commercial_pricing_plans.py`, `0090_update_commercial_plan_capacity.py`, `0091_populate_plan_feature_capabilities.py`; `app/pricing/page.tsx`.

## Feature entitlements

| Feature | Basic | Pro | Enterprise | Backend/UI enforcement status |
|---|---:|---:|---:|---|
| Maintenance jobs/photos/room/equipment history | Yes | Yes | Yes | Base features |
| Preventive maintenance | No | Yes | Yes | API capability check + navigation/page gate |
| PM schedules | No | Yes | Yes | API capability check + UI gate |
| Technician KPI | No | Yes | Yes | UI capability gate; verify every direct API path before launch |
| Advanced reports | No | Yes | Yes | UI/page capability gate |
| CSV export | No | Yes | Yes | frontend gate + plan capability structures |
| Multi-property | No | No | Yes | property creation enforces capability and limit |
| Advanced property permissions | No | No | Yes | membership/property grant capability |
| Portfolio dashboard | Coming soon | Coming soon | Coming soon | NOT IMPLEMENTED |

## Limits and enforcement

- Quantitative checks exist for properties, users, monthly work orders, assets, storage and PM schedules (`tenancy.py` and creation/completion paths).
- Subscription state machine supports FULL, GRACE, READ_ONLY and BILLING_ONLY (`entitlements.py`).
- **Runtime `SUBSCRIPTION_ENFORCEMENT_MODE` is `observe`**, so `require_subscription_write()` records/observes but does not block writes. This is the largest pricing-to-product inconsistency.
- Plan capacity currently differs only in users/properties. Jobs, PM schedules, assets and storage are identical across all three plans despite being prominent comparison rows. This is accurate at runtime but weak plan differentiation and may not match commercial intent.

## Billing integration

| Capability | Status | Evidence |
|---|---|---|
| Stripe Checkout | IMPLEMENTED (test mode) | `billing/views.py`, `stripe_service.py` |
| Customer portal | IMPLEMENTED (test mode) | billing BFF and backend endpoint |
| Webhook signature/idempotency | IMPLEMENTED | `BillingWebhookEvent`, Stripe webhook views/tests |
| Upgrade/downgrade | PARTIALLY IMPLEMENTED | Checkout/portal handoff exists; complete live lifecycle not verified |
| Cancel at period end | IMPLEMENTED in model/webhook | `TenantSubscription.cancel_at_period_end` |
| Trial/grace/read-only | IMPLEMENTED in entitlement logic | `entitlements.py` |
| Live payment collection | NOT IMPLEMENTED / NOT VERIFIED | settings explicitly accept test keys; runtime reports test mode |

## Trial and Demo

- Tenant subscription supports `trialing` and `trial_ends_at`.
- Public `/demo` is a separate unauthenticated sandbox, not a subscription trial.
- Demo data resets every 30 minutes and cannot demonstrate billing entitlements.

## Misleading/inconsistent claims

1. “Plan limits are enforced” — false in current runtime because enforcement is observe-only.
2. “Subscribe/pay now” — must be framed as test/pilot until live Stripe is enabled and reconciled.
3. “Enterprise portfolio dashboard” — pricing correctly says Coming soon; sales must do the same.
4. “Automated PM” — entitlement exists, but deployment scheduler is not verified.
5. “Advanced reports are fully localized” — report UI is English-heavy.
6. Any ROI, customer count, savings, uptime, SLA or testimonial — no evidence in repository; must not be invented.

## Commercial readiness recommendation

Pricing page is suitable for an internal/pilot presentation if clearly labeled proposed/current pilot pricing. Before public paid launch:

1. agree and freeze the plan matrix;
2. run entitlement tests for every route and direct API bypass;
3. switch from observe to enforce in staged rollout;
4. enable live Stripe with reconciliation, refund/cancellation and support runbooks;
5. add billing event monitoring and customer-facing invoices/tax policy;
6. verify trial expiry, grace and read-only UX end-to-end.
