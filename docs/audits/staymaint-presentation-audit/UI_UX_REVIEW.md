# StayMaint UI/UX Product Audit

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

หมายเหตุ: ไม่มี browser automation/screenshot tool ใน environment นี้ จึงเป็น source-backed review และจัดทำ screenshot checklist แทน ไม่ได้อ้างว่าเป็น visual QA บน device จริง

## Scorecard

| Area | Assessment | Evidence / Finding |
|---|---|---|
| Visual consistency | GOOD / PARTIAL | shared design system, badges, cards, tokens; บาง legacy pages ยัง hard-code colors/layout |
| Navigation | GOOD | grouped desktop nav, mobile bottom nav + More sheet, active-state tests |
| Typography | GOOD | consistent Tailwind scale and hierarchy; dense report/PM pages remain information-heavy |
| Color system | GOOD / PARTIAL | semantic CSS tokens and status config; legacy components retain ad-hoc Tailwind colors |
| Dashboard clarity | GOOD | KPI cards, status/priority/category, room filter, activity and technician KPI |
| Tables/filters | GOOD | desktop tables + mobile cards on major modules; report filters comprehensive |
| Mobile responsiveness | GOOD / NOT FULLY VERIFIED | safe-area, bottom navigation, touch targets, responsive tests; no real-device visual pass |
| Empty/loading/error | GOOD | loaders, skeletons, `FeedbackState`, retry/error states on principal pages |
| Forms | GOOD / PARTIAL | create-job guided location/category/images; PM form is very long/complex |
| B2B SaaS appearance | PRESENTABLE | branded shell, property context, plan gating, KPI/report views |
| Bilingual UX | PARTIALLY IMPLEMENTED | locale provider/dictionary/nav/core dashboard/PM/utility; many report/chart/machine/pricing strings remain English |
| Accessibility | PARTIAL | semantic labels/focus/touch targets exist; lint reports image alt warnings and no formal WCAG audit |

## VERIFIED FACTS

- `DashboardLayoutClient` includes desktop sidebar, responsive header, pull-to-refresh, property selector, locale/theme toggle and subscription banner.
- `mobile-nav.tsx` provides four primary actions plus secondary tools, safe-area padding and active states.
- Main create-job flow supports property-bound rooms/areas, category search, priority, photo upload and responsive layout.
- Jobs report provides filtering, KPI, charts, table and CSV/Excel/PDF actions.
- PM has list, dashboard, plans, calendar, detail and PDF views.
- Demo UI is intentionally simplified and bilingual, with mobile bottom nav and isolated data labels.

## UI/UX inconsistencies

1. `Job` backend statuses and dashboard display statuses differ (`assigned`, `waiting_vendor`, `verified` are not persisted backend choices).
2. Main report and chart dashboard contain substantial hard-coded English despite locale toggle.
3. PM create/edit component is >2,000 lines and presents many fields; progressive disclosure is limited.
4. “Overdue” corrective jobs are inferred from age/critical priority but the UI can look like an SLA metric.
5. Audit timeline visually suggests a formal audit trail while some events are parsed from editable remarks.
6. Duplicate legacy routes are safely redirected but add conceptual clutter.
7. ESLint found accessibility warnings for missing image `alt` in shared image components.

## Most presentation-ready screens

| Priority | Screen | Why show it | Reliability caveat |
|---:|---|---|---|
| 1 | `/demo/` | clean no-login dashboard, isolated sanitized data, bilingual | Demo-only |
| 2 | `/demo/create-job/` | concrete hotel workflow, room/category/photos, mobile friendly | simplified assignment/status |
| 3 | `/demo/jobs/{jobId}/` | before/after evidence, comments, status progression | synthetic sample fallback images possible |
| 4 | `/demo/report/` | live isolated KPIs + CSV/print | not full production reporting |
| 5 | `/dashboard` | real property-scoped management view | login/demo account required |
| 6 | `/dashboard/jobs-report` | strongest commercial reporting view | advanced_reports entitlement; English-heavy |
| 7 | `/dashboard/preventive-maintenance/schedule` | visually explains recurring PM | only if plans/occurrences pre-seeded |
| 8 | `/dashboard/machines/{machine_id}` | equipment lifecycle/history | data must be complete |

## Screens to avoid in a first sales demo

- Platform admin/webhook pages
- Billing checkout until live Stripe is ready
- PM checklist execution claim—the UI is incomplete
- Multi-property comparison/portfolio dashboard—it is explicitly planned
- AI assistant unless authorization, data scope and output quality have been separately validated

## Screenshot checklist

Use only demo accounts/data; hide browser password managers, email addresses and developer tools.

1. Desktop `/demo/` — property name, four KPIs, recent jobs, PM/inventory cards.
2. Mobile `/demo/` at 390×844 — header, cards, bottom nav, no clipped content.
3. Mobile `/demo/create-job/` — room/category selector and sticky submit bar.
4. `/demo/jobs/{id}/` — before/after evidence and status controls.
5. `/demo/report/` — KPI row, status/category distributions and export controls.
6. Authenticated `/dashboard` — property selector + KPI + job list.
7. `/dashboard/jobs-report` — date filters + charts + export buttons.
8. `/dashboard/preventive-maintenance/schedule` — calendar with generated and projected work clearly distinguished.
9. `/dashboard/machines/{id}` — asset details and maintenance history.
10. Repeat 1–9 in Thai and English; verify truncation, Gregorian dates and status labels.

## Recommendations

1. Finish i18n coverage on report/chart/machine/pricing/settings pages.
2. Align one canonical status vocabulary across database, API, dashboard and exports.
3. Add guided PM execution with checklist, parts, notes, evidence and confirmation summary.
4. Label heuristic overdue metrics explicitly as “open ≥3 days / critical” until Job due dates/SLA exist.
5. Replace synthetic audit wording with “Activity” until immutable events exist.
6. Add Playwright mobile/desktop visual tests and WCAG 2.2 AA audit.
7. Resolve shared image alt/performance lint warnings and reduce broad `any` usage.
