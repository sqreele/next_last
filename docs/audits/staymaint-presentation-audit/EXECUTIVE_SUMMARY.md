# StayMaint — Executive Audit Summary

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

วันที่ตรวจ: 6 พฤศจิกายน 2026  
ขอบเขต: source/configuration, CI/tests, Docker runtime health, migration state และ aggregate-only property integrity checks. ไม่มีการแก้ application source, database records, configuration หรือ production services.

## Overall system maturity

**Maturity: Functional SaaS foundation / controlled pilot candidate; commercial production readiness is conditional.**

StayMaint มีระบบ multi-tenant/multi-property, Auth0 authentication, role/property scopes, corrective work orders, media evidence, PM plans/calendar, room/equipment history, analytics/export, isolated public demo และ pricing/subscription domain. หลักฐาน runtime สนับสนุนว่าระบบปัจจุบันทำงาน: Docker services 7/7 healthy, health endpoint ผ่าน, Django `check --deploy` ผ่าน, migrations apply ถึง 0096 และ frontend tests ผ่าน 52/52.

อย่างไรก็ตาม ยังมีความเสี่ยงที่กระทบความพร้อมขายแบบ SaaS เต็มรูปแบบ: subscription enforcement เป็น `observe`, Stripe เป็น test mode, ไม่มี scheduler/backup restore/central monitoring ที่ยืนยันได้, audit attribution ของ Job เปลี่ยนตามผู้รับงาน และ PM checklist UI ยังไม่ครบ. ดังนั้น **พร้อมนำเสนอผลิตภัณฑ์แบบมีเงื่อนไขและระบุ maturity ตามจริง; ยังไม่ควรประกาศเป็น fully production-ready commercial SaaS.**

## VERIFIED FACTS

| หมวด | สิ่งที่ยืนยันได้ |
|---|---|
| Architecture | Next.js 15.5.9 / React 18.3.1 / Django 4.2.30 / DRF 3.17.2 / PostgreSQL 17 / Redis 7; Auth0 + BFF; Nginx HTTPS |
| Tenant/property | `Tenant` owns properties; `TenantMembership` grants roles/properties; Job and Room have canonical Property scope |
| Corrective jobs | create, category/priority, assign/reassign, status update, comments/remarks, before/after images, dashboard, report exports |
| PM | master plans, recurrence frequencies, projection/materialization, calendar, completion, PM history, machine links, stats/upcoming/overdue |
| Reporting | selected-property KPIs and filters; CSV server export; Excel/PDF client exports |
| Demo | public bilingual `/demo`, isolated database; 9 rooms, 10 categories, 1 area, 13 jobs, 4 inventory items, 2 PM display rows; 30-minute reset |
| Canonical integrity | runtime aggregate checks: Job↔Room 0 mismatches, Job↔Area 0, PM Job↔Machine 0, multi-property PM machine sets 0, inventory-use mismatches 0 |
| Runtime | 7/7 containers healthy; `/api/health/` returned `{"status":"ok"}`; Django deploy check 0 issues; migrations applied through 0096 |
| Frontend QA | 52 tests passed, TypeScript passed, ESLint 0 errors / 316 warnings |
| Backend QA | 66 test files exist; CI executes a narrower canonical-property subset. Full backend suite not run in this read-only audit because it creates a test database |

## Partially implemented features

| Feature | Current maturity |
|---|---|
| Corrective status workflow | status choices exist, but no complete transition matrix; aliases in UI are not all backend states |
| Assignment/history | reassign works, but `Job.user` doubles as creator and assignee, making creator history inaccurate after reassignment |
| Audit trail | timeline combines admin log/current state/comments and parses status messages from mutable remarks; not a dedicated immutable event log |
| PM checklist | backend model/API accepts checklist updates; verified detail completion UI sends date only |
| PM automation | plan materialization/reminder commands exist; automated scheduler execution not verified |
| Email/LINE/Web Push | implementation exists; delivery and operational scheduling not end-to-end verified |
| Bilingual UI | strongest in Demo and core navigation; many report/chart/machine/pricing strings remain English |
| Pricing/billing | plan limits and Stripe workflows exist; runtime enforcement is observe-only and Stripe test mode |

## Production risks

1. Runtime entitlement enforcement is `observe`, so limits/state may not block writes.
2. Stripe uses test mode; live collection/reconciliation is not ready/verified.
3. `Job.user` conflates creator and assignee; reassignment alters creator attribution.
4. No scheduled backup/restore test, off-site backup evidence or RPO/RTO runbook found.
5. PM/reminder/email management commands exist without a verified scheduler service.
6. Tenant invitation pending-email uniqueness is globally scoped per an explicit model comment; must become tenant-scoped before public multi-organization launch.
7. Centralized monitoring/APM and general Nginx request limiting are not verified.
8. Media uses local filesystem volumes; off-site media recovery and horizontal scaling are unverified.
9. Backend CI runs only a subset of available tests; 316 frontend lint warnings remain.

## Top 10 improvement priorities

1. Add immutable `created_by` and mutable `assigned_to`; store explicit Job lifecycle events.
2. Validate every plan/entitlement API path and stage `observe`→`enforce` with regression coverage.
3. Complete live Stripe setup, webhook reconciliation, refunds/cancellations and billing runbooks.
4. Deploy a durable scheduled worker for PM generation/reminders/summaries, with retries and alerts.
5. Automate encrypted off-site DB/media backups and prove restore through periodic drills.
6. Scope pending invitation email uniqueness to Tenant.
7. Add centralized structured logs, error tracking, metrics, alerting and incident ownership.
8. Expand CI to run all backend tenancy/auth/billing/PM suites and add browser end-to-end coverage.
9. Finish PM checklist/parts/evidence execution UI and define corrective Job transition rules.
10. Align status labels and i18n; resolve accessibility/hook warnings and add mobile visual checks.

## Suitable for live demonstration

- Public `/demo/` dashboard with sanitized isolated data.
- `/demo/create-job/`: room/area, category, priority, before photo.
- `/demo/jobs/{jobId}/`: pending→in progress→completed, comment and after photo.
- `/demo/report/`: live demo KPIs, CSV and browser print/PDF.
- Optional authenticated `/dashboard`, `/dashboard/jobs-report`, PM plans/calendar and machine history using a provisioned sanitized demo tenant.

## Not suitable for commercial claims

- “Fully production-ready” without qualification.
- Live billing, enforced plan quotas, or complete upgrade lifecycle.
- Portfolio/property comparison analytics.
- Guaranteed automated PM generation or notifications.
- Complete interactive PM checklist execution.
- Immutable audit trail/accurate original creator attribution.
- SLA-based overdue metrics; corrective overdue is a UI heuristic.
- Quantified savings, ROI, uptime, customer counts, testimonials or compliance certifications.

## Recommended presentation narrative

“StayMaint organizes hotel maintenance around each property. Teams can record work by room or area, attach before/after evidence, update status and review operational reports. Engineering leaders can also define recurring PM plans and view equipment history. The core corrective workflow and reporting are implemented; PM execution, commercial billing controls and operational recovery are being hardened. A public sandbox demonstrates the product using isolated demo data.”

## Recommended next development phase

**Commercial hardening and pilot readiness**: first correct creator/assignee/audit semantics, enable and verify entitlement enforcement, prove PM checklist/materialization scheduling, establish backup and restore, add monitoring, complete tenant-scoped invitations, and expand automated backend/E2E coverage. Then run a controlled hotel pilot with acceptance criteria for data isolation, workflow completion, notification delivery, exports, backup recovery and support response.

## Audit deliverables

See companion reports in this directory: `SYSTEM_ARCHITECTURE.md`, `FEATURE_INVENTORY.md`, `WORKFLOW_AUDIT.md`, `PRODUCTION_READINESS.md`, `UI_UX_REVIEW.md`, `PRICING_AUDIT.md`, `DEMO_SCRIPT.md`, and `PRESENTATION_OUTLINE.md`.

## UNVERIFIED ITEMS

- Auth0/Stripe/SMTP/LINE live end-to-end delivery, disaster recovery, restore procedures, load behavior, browser visual quality and external security testing.
- No screenshots captured in this audit; `UI_UX_REVIEW.md` contains a sanitized screenshot checklist.

## Final answer

**Is StayMaint ready for a professional SaaS sales presentation? CONDITIONAL.**

The public Demo and verified corrective-job/reporting flows are suitable for a product presentation. Present PM scheduling as implemented with execution caveats, and describe billing, automated operations, audit history and portfolio analytics with the limitations above. Do not claim full production readiness, live payments or quantified business outcomes until the corresponding evidence exists.
