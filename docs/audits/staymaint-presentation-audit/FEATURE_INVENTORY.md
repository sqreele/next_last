# StayMaint Feature Inventory

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

สถานะ: **IMPLEMENTED**, **PARTIALLY IMPLEMENTED**, **DEMO ONLY**, **PLANNED**, **NOT IMPLEMENTED**, **NOT VERIFIED**

## A. Authentication & Users

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| Auth0 login/logout | IMPLEMENTED | `app/api/auth/[...auth0]/route.ts`, `middleware.ts`, `myappLubd/auth.py::Auth0JWTAuthentication` |
| Registration/onboarding | PARTIALLY IMPLEMENTED | Auth0 registration route/page และ onboarding มี; backend local `RegisterView` ถูกปิดใน production ด้วย `LegacyApplicationAuthEnabled` |
| Password recovery | PARTIALLY IMPLEMENTED | local reset API มีแต่ production-disabled; Auth0-managed recovery end-to-end ไม่ได้พิสูจน์จาก repository |
| Opaque server session/BFF | IMPLEMENTED | `middleware.ts`; `app/api/v1/[...path]/route.ts` ไม่เชื่อ browser Authorization |
| User invitation | IMPLEMENTED | `TenantInvitation`, hash-only token, expiry/revoke/accept และ frontend `/invitations/accept` |
| User management | IMPLEMENTED | `/dashboard/settings/users`; `TenantMembershipViewSet`; invitation management BFF |
| Roles | IMPLEMENTED | owner/admin/manager/supervisor/technician/viewer/billing; platform roles แยกใน `PlatformMembership` |
| Property access restriction | IMPLEMENTED | `tenancy.py::get_accessible_properties`, `get_operable_properties`; membership property grants |
| Cross-tenant invitation email rule | PARTIALLY IMPLEMENTED | `TenantInvitation` comment ระบุ pending email uniqueness ยัง global และต้อง tenant-scope ก่อน public multi-org launch |

## B. Property Management

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| Create/edit property | IMPLEMENTED | `PropertyViewSet`; `/dashboard/properties` |
| Assign users to properties | IMPLEMENTED | `TenantMembership.properties`; settings/users UI; advanced-property-permissions capability |
| Room inventory | IMPLEMENTED | `Room` canonical FK; `RoomViewSet`; `/dashboard/rooms` |
| Public areas | IMPLEMENTED | `Area`, `AreaViewSet`; `/dashboard/areas` |
| Equipment/assets | IMPLEMENTED | `MachineViewSet`; list/detail/history routes |
| Inventory/parts | IMPLEMENTED | `InventoryViewSet`, `InventoryUsage`, categories, property-scoped authorization |
| Multi-property access | IMPLEMENTED | tenant-wide and property-grant scopes; Enterprise feature/limit |
| Portfolio comparison dashboard | PLANNED | `portfolio_dashboard: false`; pricing table labels “Coming soon” |
| Property-level isolation | IMPLEMENTED | canonical queryset/write gates; runtime aggregate mismatch checks = 0 สำหรับ Job/Room/Area/InventoryUsage |

## C. Work Order Management

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| Create maintenance job | IMPLEMENTED | `/dashboard/create-job`; `JobViewSet.perform_create`; `JobSerializer.create` |
| Room or area selection | IMPLEMENTED | serializer requires room(s) or area; canonical property validation |
| Assign/reassign technician | IMPLEMENTED | `Job.user`; `/jobs/{job_id}/reassign`; role-limited candidates |
| Categories | IMPLEMENTED | `Topic`; searchable/selectable create UI; multiple topics read model |
| Priority | IMPLEMENTED | low/medium/high/critical |
| Status workflow | PARTIALLY IMPLEMENTED | backend choices pending/in_progress/waiting_sparepart/completed/cancelled; completed cannot reopen. No explicit full transition matrix for corrective jobs, so pending→completed is accepted |
| Before/after photos | IMPLEMENTED | pending upload tokens, limits 20 before/5 after, completion-only after evidence, JPEG optimization |
| Repair notes/comments | IMPLEMENTED | `remarks`, `JobComment`, comments endpoint |
| Job history/audit | PARTIALLY IMPLEMENTED | admin log + synthetic API timeline; status history parsed from free-text remarks, no immutable dedicated domain audit log |
| Soft delete | IMPLEMENTED | `Job.delete` soft-delete; migration `0092_job_soft_delete` |
| LINE/Web Push notifications | PARTIALLY IMPLEMENTED | code/signals/durable LINE structures exist; external delivery not verified |
| Email job summaries | PARTIALLY IMPLEMENTED | commands/templates exist; runtime recipient/OAuth values absent and scheduling not verified |
| Creator identity | PARTIALLY IMPLEMENTED | `Job.user` เป็นทั้ง creator ตอน create และ assignee ตอน reassign; `created_by_name`/created timeline จึงไม่ reliable หลัง reassign |

## D. Preventive Maintenance (PMM)

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| PM record CRUD | IMPLEMENTED | `PreventiveMaintenanceViewSet`; list/create/edit/detail pages |
| PM master plans | IMPLEMENTED | `PMMasterPlan`; plans CRUD, projection/materialization endpoints and UI |
| Frequencies | IMPLEMENTED | daily/weekly/monthly/quarterly/semi-annual/annual/custom; calendar-aware recurrence |
| PM schedule/calendar | IMPLEMENTED | `/dashboard/preventive-maintenance/schedule`; backend `schedule`, `projection`, `materialize-plans` |
| Assigned technician | IMPLEMENTED | `assigned_to`; property-scoped assignment |
| Room PM | PARTIALLY IMPLEMENTED | PM may derive location through optional Job; no direct canonical PM→Room field |
| Equipment PM | IMPLEMENTED | PM/plan ↔ Machine M2M and machine maintenance history |
| PM checklist data | IMPLEMENTED | `MaintenanceChecklist`; completion endpoint accepts/updates checklist items |
| Checklist execution UI | PARTIALLY IMPLEMENTED | production detail “Complete” sends only `completed_date`; no verified interactive checklist payload in `PreventiveMaintenanceClient` |
| PM completion/history | IMPLEMENTED | transaction, transition validation, inventory consumption, after evidence, `MaintenanceHistory`, next schedule |
| Overdue/upcoming/dashboard | IMPLEMENTED | `stats`, `upcoming`, `overdue`, dashboard and calendar pages |
| Automatic PM generation | PARTIALLY IMPLEMENTED | idempotent command/API exists; recurring scheduler execution NOT VERIFIED |
| PM vs Defect separation | PARTIALLY IMPLEMENTED | Job has independent booleans `is_preventivemaintenance`/`is_defective`; PM is also a separate model, creating two concepts that UI/report must reconcile |
| Public Demo PM workflow | DEMO ONLY (display) | Demo snapshot shows PM records, but no public PM plan/checklist execution flow |

## E. Dashboards & Analytics

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| Total/open/completed/cancelled jobs | IMPLEMENTED | jobs dashboard/stats and dashboard UI |
| Overdue jobs | PARTIALLY IMPLEMENTED | main dashboard computes overdue client-side from age ≥3 days or critical; no due-date/SLA field on corrective Job |
| Technician performance | IMPLEMENTED | `TechnicianKpiBoard`, top users chart; plan-gated `technician_kpi` |
| Frequent defects/categories | IMPLEMENTED | topic/category aggregation in report/chart dashboard |
| PM completion percentage | IMPLEMENTED | PM stats `completion_rate`, PM dashboard |
| Room maintenance history | IMPLEMENTED | room detail/jobs and by-topic views |
| Equipment history | IMPLEMENTED | Machine detail + `maintenance_history` endpoint |
| Property comparison | NOT IMPLEMENTED | portfolio dashboard is explicitly false/Coming soon; current analytics require one selected property |
| CSV export | IMPLEMENTED | server-authorized jobs CSV and client CSV utilities; plan-gated |
| Excel/PDF export | IMPLEMENTED | JobsReport uses `xlsx`/PDF utility; PM detail uses jsPDF/html2canvas |
| Report date/property/category/user filters | IMPLEMENTED | `JobViewSet._jobs_report_queryset`; `JobsReport.tsx` |

## F. Demo

| Feature | Status | Evidence / หมายเหตุ |
|---|---|---|
| Public no-login Demo | DEMO ONLY | `/demo`; isolated `demo-backend`, `db-demo`, `DEMO_MODE=True` |
| Demo create job/photos | DEMO ONLY | public create API validates category/location/MIME/3MB and writes isolated DB |
| Demo job progression | DEMO ONLY | only pending→in_progress→completed; after photo on complete |
| Demo comments | DEMO ONLY | isolated comments endpoint |
| Demo report | DEMO ONLY | KPI/distribution, CSV, print/PDF via browser |
| Demo bilingual TH/EN | DEMO ONLY | `DemoLanguageProvider`, bilingual labels |
| Demo reset | DEMO ONLY | 30-minute dataset reset; reset throttle 2/min |

Runtime demo snapshot: Chinatown `PB749146D`, 9 rooms, 10 categories, 1 area, 13 jobs, 4 inventory items, 2 PM records. Data is separate from production.

## Other modules found

Utility consumption, floor plan, maintenance procedure templates, inventory/category/usage, AI assistant, contact form, guest/public job request, platform admin/usage/webhook views และ billing settings มี source/API/UI แต่ไม่ได้หมายความว่า external integration ทุกตัวผ่าน production verification.

## UNVERIFIED ITEMS

- Real notification delivery, production Auth0 recovery, backup/restore, scheduled PM generation
- Browser-level accessibility/performance and visual regression across supported devices
- Production load behavior and query plans at hotel-group scale

## Claims ที่ห้ามใช้

- “Full portfolio dashboard/property comparison”
- “Automated PM always runs on schedule” จนกว่าจะยืนยัน scheduler
- “Complete immutable audit trail”
- “Live billing” หรือ “production Stripe payments” (runtime เป็น test mode)
- “All screens bilingual”
- “Guaranteed backup/disaster recovery”
