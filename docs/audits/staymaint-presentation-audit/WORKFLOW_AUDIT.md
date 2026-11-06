# StayMaint Workflow Audit

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

## Workflow 1 — Corrective Maintenance

```text
Create Job → Assign/Reassign → In Progress → Repair notes/comments
→ After photo → Complete → Detail/timeline → Dashboard/report
```

| Step | Page / API | Database operation | Status / Finding |
|---|---|---|---|
| Create | `/dashboard/create-job`; `POST /api/v1/jobs/` | `Job`, rooms M2M, topic M2M, `JobImage`; atomic | IMPLEMENTED; property required and room/area must match |
| Upload before | `POST /jobs/pending-images/` then create | `PendingJobImage` → `JobImage` | IMPLEMENTED; owner/property/expiry/count/storage checks |
| Initial assignee | create path | `Job.user=request.user` | PARTIAL semantics: creator becomes assignee automatically |
| Reassign | job detail; `POST /jobs/{id}/reassign/` | changes `Job.user`, appends remark/admin log, pushes | IMPLEMENTED; owner/admin/manager/supervisor only |
| Start work | my-jobs/detail; `PATCH /jobs/{id}/update_status/` | status update | IMPLEMENTED; property operator gate |
| Repair evidence | completion form/status modal | `JobImage(image_type=after)` | IMPLEMENTED; only with completed status, max 5 |
| Complete | same endpoint | status + `completed_at` transaction | IMPLEMENTED; completed cannot reopen |
| Notes/comments | comments endpoint; remarks | `JobComment`, `Job.remarks` | IMPLEMENTED |
| History | `/jobs/{id}/audit-log/` | computed from state/images/comments/remarks | PARTIAL; status events are parsed from free text, not immutable audit rows |
| Dashboard/report | `/dashboard`; `/dashboard/jobs-report` | aggregate/filter queries | IMPLEMENTED per selected property |

### Broken/inconsistent transitions

- Corrective Job backend validates only that status is one of five choices; it does not enforce a transition graph. A caller can move `pending` directly to `completed` or `waiting_sparepart` to `pending`. Only reopening completed is blocked.
- Frontend `ImprovedDashboard` displays aliases such as `assigned`, `waiting_vendor`, `verified`, but backend `Job.STATUS_CHOICES` does not store these values. They are presentation/normalization states, not verified workflow states.
- `Job.user` is both creator and current assignee. Reassignment changes what `created_by_name` and synthetic “Job created” actor report. This undermines historical attribution.

### Permission boundary

- Read: `get_accessible_properties(user)`.
- Operational write: `get_operable_properties(user)`; viewer/billing excluded.
- Reassignment: owner/admin/manager/supervisor; technician excluded.
- Runtime canonical checks found 0 Job↔Room and Job↔Area property mismatches.

## Workflow 2 — Preventive Maintenance

```text
PM Master Plan → Frequency/lead time/machines → Projection/materialization
→ Assigned PM occurrence → Execute → Complete → History/next occurrence
→ PM dashboard/calendar
```

| Step | Page / API | Database operation | Status / Finding |
|---|---|---|---|
| Create plan | `/dashboard/preventive-maintenance/plans/create`; `POST .../plans/` | `PMMasterPlan`, machines/topics M2M | IMPLEMENTED; owner/admin/manager only |
| Frequency | plan form | stores frequency/custom days/start/lead time | IMPLEMENTED |
| Project schedule | `/schedule`; `GET projection/`, `GET schedule/` | calculated occurrences | IMPLEMENTED |
| Generate occurrence | `POST materialize-plans/`; management command | creates `PreventiveMaintenance` with unique plan/date semantics | PARTIAL operationally: invocation exists, scheduler NOT VERIFIED |
| Assign technician | PM form/plan | `assigned_to` | IMPLEMENTED |
| Execute checklist | completion endpoint accepts `checklist_items` | create/update `MaintenanceChecklist` | PARTIAL UI: detail completion sends only `completed_date` |
| Consume parts | completion endpoint accepts `inventory_usage` | `InventoryUsage` transaction | IMPLEMENTED backend; execution UI integration NOT VERIFIED |
| Complete/evidence | `POST /preventive-maintenance/{pm_id}/complete/` | status, date, after image, history, machine last-maintenance, next occurrence | IMPLEMENTED atomically |
| History | PM detail, machine history | `MaintenanceHistory`, PM images | IMPLEMENTED |
| Dashboard | `/dashboard/preventive-maintenance/dashboard` | stats/upcoming/overdue | IMPLEMENTED |

### Missing/inconsistent functionality

- Checklist model and backend completion contract exist, but production PM detail UI does not present an execution checklist in the verified completion handler.
- PM can exist without Job (78 production records at audit time); room ownership then cannot be inferred unless another location relation is present. Equipment PM is clearer because Machine has canonical Property.
- “Automatic generation” should be described as “recurring plans with materialization support” until a scheduler is verified.
- PM and corrective Job separation is conceptually mixed: PM has its own model while Job also has `is_preventivemaintenance`.

## Workflow 3 — Management Reporting

```text
Select Property → Load authorized jobs → Filter/search/date
→ KPI/charts/detail → CSV/Excel/PDF
```

| Step | Page / API | Status / Finding |
|---|---|---|
| Select property | global property selector | IMPLEMENTED; required scope |
| KPI/dashboard | `/dashboard`, `/dashboard/chartdashboard` | IMPLEMENTED; total/status/priority/category/user trends |
| Jobs report | `/dashboard/jobs-report` | IMPLEMENTED |
| Filters | status, priority, PM, topic, user, month/year, date range, search | IMPLEMENTED in frontend and backend CSV query |
| CSV | `GET /jobs/report-csv/` | IMPLEMENTED server-side, same authorized property boundary |
| Excel/PDF | client export utilities | IMPLEMENTED; generated from loaded filtered data |
| Property comparison | — | NOT IMPLEMENTED; one active property at a time |

### Integration notes

- CSV performs a fresh server-authorized query and is the strongest export boundary.
- Excel/PDF are client-side and depend on the completeness/currentness of loaded rows.
- Corrective “overdue” on main dashboard is a UI heuristic (age ≥3 days or critical), not an explicit SLA/due-date calculation.

## Public Demo workflow

| Step | Route | Safe action | Expected result | Limitation |
|---|---|---|---|---|
| Open | `/demo/` | no login | isolated Chinatown dashboard | demo-only data |
| Create | `/demo/create-job/` | choose category + room/area + before photo | new isolated `DWEB…` job | technician auto-selected; max 100 jobs |
| Progress | `/demo/jobs/{id}/` | pending→in progress | status updates | only linear transitions |
| Complete | same | add after evidence | completed timestamp/photo | no assignment workflow |
| Comment | same | add sanitized note | comment appears | author is demo technician |
| Report | `/demo/report/` | filter/view/export CSV/print | live demo KPIs | no production report entitlement/auth |

Public Demo PM is display-only; do not present it as a full PM execution demonstration.

## Test evidence

- Frontend: 52/52 Node tests passed on audit date.
- TypeScript: passed.
- ESLint: 0 errors, 316 warnings.
- Backend: 66 test files exist; CI runs only the canonical-property subset in `.github/workflows/ci.yml`.
- Backend tests were not executed during this audit because Django creates a test database and the user required a strictly read-only database audit.
