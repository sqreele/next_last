# StayMaint Production Readiness Audit

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

## Overall assessment

ระบบมี production-grade foundations หลายส่วน—Auth0/BFF, canonical tenant/property scope, transactions, migrations, HTTPS และ health checks—แต่ยังไม่ควรประกาศว่าเป็น fully production-ready commercial SaaS จนกว่าจะปิดความเสี่ยงด้าน billing enforcement, audit integrity, scheduler, backup/recovery และ observability.

## Findings by severity

| Severity | Type | Finding | Evidence | Impact |
|---|---|---|---|---|
| HIGH | VERIFIED DEFECT/RISK | Subscription enforcement runtime เป็น `observe`, จึงไม่ block writes แม้ UI/entitlements แสดงข้อจำกัด | runtime settings; `subscription_permissions.py::require_subscription_write` | ลูกค้าอาจใช้เกิน plan/state; commercial control ไม่ enforce |
| HIGH | VERIFIED LIMITATION | Stripe runtime เป็น test mode เท่านั้น | runtime boolean/mode; `settings.py` rejects non-test key | รับเงินจริง/production billing ยังกล่าวอ้างไม่ได้ |
| HIGH | VERIFIED DEFECT | `Job.user` conflates creator and assignee; reassign rewrites creator attribution used by serializers/audit timeline | `JobSerializer.create`, `reassign`, `created_by_name`, `audit_log` | audit/history และ accountability ไม่ถูกต้อง |
| HIGH | VERIFIED RISK | ไม่พบ automated backup schedule, off-site copy หรือ restore test/runbook | `docker-compose.yml`; dbbackup settings; repository search | data recovery/RPO/RTO ไม่พิสูจน์ |
| HIGH | VERIFIED RISK | PM materialization/reminder/email commands exist แต่ไม่มี worker/scheduler service ใน deployment | commands + `docker-compose.yml` | scheduled PM/reminders may not run automatically |
| HIGH | VERIFIED LIMITATION | Pending invitation email uniqueness ยัง global ตาม model comment | `models.py::TenantInvitation` | multi-organization invitation conflict |
| MEDIUM | VERIFIED RISK | Status history is synthesized from mutable remarks, not immutable audit events | `JobViewSet.audit_log` | history may be incomplete/alterable |
| MEDIUM | VERIFIED RISK | Auth0 JWKS fetched synchronously for authentication without verified caching | `auth.py::_validate_auth0_token` | external latency/outage affects API authentication |
| MEDIUM | VERIFIED RISK | Local filesystem media; no verified object storage/off-site media backup | `settings.py`, compose volumes | single-host failure/scaling risk |
| MEDIUM | VERIFIED RISK | Central monitoring/error tracking absent | logging config/repository search | slow incident detection and diagnosis |
| MEDIUM | VERIFIED RISK | Nginx defines rate zone but no general `limit_req` application found | `nginx/conf.d/00-global-limits.conf` | most authenticated endpoints lack edge rate limiting |
| MEDIUM | VERIFIED GAP | CI backend tests only a small subset of 66 backend test files | `.github/workflows/ci.yml` | security/billing/PM regressions can merge undetected |
| MEDIUM | VERIFIED GAP | PM checklist backend exists but completion UI sends only date | PM view vs `PreventiveMaintenanceClient::handleMarkComplete` | claimed checklist execution not complete end-to-end |
| MEDIUM | VERIFIED RISK | Corrective status endpoint lacks a transition matrix | `JobViewSet.update_status` | workflow states can be skipped |
| MEDIUM | POTENTIAL RISK | No API-wide pagination guarantee: `/jobs/all/` intentionally returns unpaginated data | `JobViewSet.all` | large tenant exports can consume memory/latency |
| MEDIUM | VERIFIED QUALITY DEBT | ESLint reports 316 warnings, including hook dependencies, `any`, image alt/performance | audit lint result | maintainability and UI correctness risk |
| LOW | VERIFIED INCONSISTENCY | Frontend shows status aliases absent from backend choices | `ImprovedDashboard.STATUS_SUMMARY`; `Job.STATUS_CHOICES` | user confusion/report mismatch |
| LOW | VERIFIED DEBT | Duplicate legacy routes exist as redirects | `createJob`, `myJobs`, `Preventive_maintenance`, `chartdashboad` | route clutter only; redirects mitigate |

ไม่มี CRITICAL finding ที่ยืนยันว่าเกิด active breach/data corruption ณ เวลาตรวจ แต่ HIGH findings ข้างต้นขัดกับคำกล่าวอ้าง “fully production-ready commercial SaaS”.

## Security controls

### VERIFIED FACTS

- Auth0 JWT validates RS256, issuer, audience, expiry and iat.
- Identity binds durable `(issuer, subject)` and requires pre-provisioned verified email for first binding.
- Browser Authorization header is discarded by BFF; server session supplies bearer token.
- Production DRF default permission is `IsAuthenticated`; legacy local JWT auth is gated off.
- Tenant and property querysets are centralized; Job/Room canonical FKs are enforced.
- Secure cookies, SSL redirect, HSTS, CSRF secure, X-Frame DENY and nosniff are configured.
- File count/size/type/path constraints and image optimization are present; PM validates image content through Pillow processing.
- Invitation tokens are hash-only with expiry and throttles.
- Demo is isolated, rate-limited and guarded by `DEMO_MODE`.

### RISKS / NOT VERIFIED

- CSRF is relevant to Django session/admin routes; browser app uses BFF bearer flow. Full cross-origin penetration testing not performed.
- No WAF/API-wide rate policy verified.
- Secrets are environment-driven, but `DJANGO_SECRET_KEY` retains an unsafe source fallback string if environment validation fails.
- Dependency vulnerability/SBOM scan was not run.

## Reliability and operations

| Area | Assessment |
|---|---|
| Migrations | VERIFIED: all through 0096 applied; CI checks dry-run migrations |
| Transactions | GOOD in Job create/images, PM completion, invitation/billing paths |
| Error handling | Mixed; DRF validation is common, but broad exception handling/log-only patterns exist |
| Health checks | VERIFIED healthy containers and frontend health endpoint |
| Backup | NOT VERIFIED operationally |
| Recovery/rollback | NOT VERIFIED; no documented restore/rollback workflow found |
| Background reliability | PARTIAL; idempotency/locking exists in places, scheduler absent |
| Monitoring | NOT IMPLEMENTED beyond logs/health checks |

## Performance

- Positive: `select_related`/`prefetch_related`, indexes, pagination and filtered dashboard/report queries are widely used.
- Risk: `/jobs/all/` serializes all matching jobs; client Excel/PDF can become expensive.
- Risk: LocMem default cache is per-process; cache coherence differs when horizontally scaled.
- Risk: Auth0 JWKS network fetch on request path.
- Frontend has loading/error/empty states in principal pages, dynamic imports for PDF tools, and responsive navigation.
- Actual load test, Core Web Vitals and database EXPLAIN evidence are NOT VERIFIED.

## Top 10 priorities

1. Separate immutable `created_by` from mutable `assigned_to`; add a real Job event/audit model.
2. Turn subscription enforcement to `enforce` only after full entitlement regression/UAT and migration plan.
3. Complete production Stripe readiness, webhook secrets, reconciliation and incident procedures.
4. Install a durable scheduler/worker with retries/alerts for PM, reminders and summaries.
5. Implement automated encrypted off-site DB/media backups and quarterly restore tests.
6. Make invitation uniqueness tenant-scoped.
7. Add centralized logs, Sentry/APM, metrics, alerting and audit dashboards.
8. Run all backend security/tenancy/billing/PM tests in CI; add browser E2E tests.
9. Complete PM checklist/parts/evidence UI and enforce corrective status transitions.
10. Reduce lint warnings and add accessibility/mobile visual regression gates.

## Test results

| Check | Result |
|---|---|
| Docker services | 7/7 healthy |
| Django `check --deploy` | Passed, 0 issues |
| Migrations | All listed migrations applied through 0096 |
| Frontend tests | 52 passed, 0 failed |
| TypeScript | Passed |
| ESLint | Exit 0; 0 errors, 316 warnings |
| Backend full test suite | NOT RUN (read-only constraint) |
