# Professional SaaS Presentation Outline

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

ใช้ภาพ product จริงเป็นหลัก; status ใช้ IMPLEMENTED / PARTIAL / DEMO ONLY / PLANNED.

| # | Slide title | Key message | Verified evidence | Suggested visual | Talking points | Maturity | Must not claim |
|---:|---|---|---|---|---|---|---|
| 1 | StayMaint — Hotel Maintenance Operations | one property-scoped workspace for engineering work | product routes/models | Demo dashboard hero | issue→evidence→status→report | IMPLEMENTED core | market leader/customer count |
| 2 | The Hotel Maintenance Problem | fragmented requests reduce visibility | product problem framing only | simple request lifecycle diagram | focus on accountability and response visibility | N/A | invented statistics/ROI |
| 3 | Introducing StayMaint | connect rooms, equipment, jobs and PM | canonical models/API | domain map from architecture report | data follows property boundary | IMPLEMENTED/PARTIAL | every relation is complete |
| 4 | Product Architecture | secure web SaaS + isolated demo | Next/Django/Postgres/Redis/Auth0/Nginx | architecture diagram | BFF, tenant/property scope, isolated demo DB | IMPLEMENTED | certified compliance/HA |
| 5 | Management Dashboard | see workload at one property | `/dashboard`, jobs dashboard API | real sanitized dashboard | status, priority, room/category | IMPLEMENTED | portfolio comparison; SLA overdue |
| 6 | Work Order Management | capture and progress corrective work | Job API/create/detail/status/images | create-job + job detail | room/area, category, priority, evidence | IMPLEMENTED/PARTIAL | strict full transition workflow |
| 7 | Preventive Maintenance | recurring rules and schedule visibility | PMMasterPlan, projection/materialization, calendar | PM schedule | daily→custom frequencies, equipment assignment | IMPLEMENTED/PARTIAL ops | scheduler guaranteed; complete checklist UI |
| 8 | Room & Equipment History | preserve operational context | room detail, machine maintenance history | room + machine detail | recurring issues and asset history | IMPLEMENTED | guest/occupancy integration |
| 9 | Technician Workflow | mobile queue and evidence-based completion | my-jobs, mobile nav, status/photos | phone screenshots | job list→work→photo→complete | IMPLEMENTED | native mobile/offline fully supported |
| 10 | Analytics & Reporting | filter and export actionable records | jobs report, CSV/Excel/PDF | report charts/table | date/category/user/status filters | IMPLEMENTED | predictive analytics/portfolio BI |
| 11 | Multi-Property Management | membership/property grants and Enterprise capacity | TenantMembership, max 5 Enterprise | tenant→properties diagram | centralized access with selected property | IMPLEMENTED base | portfolio dashboard/comparison |
| 12 | Security & Access Control | Auth0 identity + role/property boundaries | Auth0 JWT, BFF, tenancy helpers | security boundary diagram | roles, canonical scope, HTTPS | IMPLEMENTED/PARTIAL readiness | compliance certification, zero risk |
| 13 | Real Product Demo | demonstrate live isolated workflow | `/demo` runtime dataset | live demo | create→progress→complete→report | DEMO ONLY | demo equals production entitlement flow |
| 14 | Subscription Plans | Basic/Pro/Enterprise current configuration | runtime plan query/pricing page | pricing table | explain users/properties/features | PARTIAL commercial | limits enforced; live payments |
| 15 | Hotel Operational Benefits | visibility, evidence and structured history | direct capability mapping | before/after workflow | operational benefits, no numeric promise | SUPPORTED QUALITATIVELY | cost saving %, response reduction |
| 16 | Product Roadmap | close verified gaps | audit priorities | Now/Next/Later timeline | audit trail, scheduler, billing, backups, observability | PLANNED | delivery dates unless approved |
| 17 | Why StayMaint | hotel-specific property/room/equipment context | implemented domain/UI | product collage | practical engineering workflow | IMPLEMENTED core | unique/patented/industry-leading |
| 18 | Next Steps | pilot with sanitized data and measurable acceptance | demo environment + readiness gaps | pilot checklist | scoped pilot, UAT, security/ops gates | RECOMMENDED | production launch immediately |

## Audience emphasis

| Audience | Emphasize | Avoid |
|---|---|---|
| General Manager | visibility, reporting, overdue/open workload | technical architecture depth |
| Chief Engineer | job flow, photos, room/equipment history, PM schedule | unverified automation claims |
| Owner / Management Company | roles, property boundary, exports, pilot governance | portfolio dashboard claim |
| Facility Management | areas, machines, inventory, procedures | hotel-guest integration claim |
| Investor | verified architecture/maturity/roadmap | invented traction, TAM, revenue, customers |

## Recommended presentation narrative

“StayMaint turns hotel maintenance from scattered requests into property-scoped operational records. A technician can receive and document work from a phone; managers can review workload, evidence and reports; engineering leaders can define recurring preventive plans and asset history. The core corrective workflow and reporting are implemented. The next commercial-hardening phase focuses on immutable audit history, verified automation, live billing, backup/recovery and observability.”

## Evidence appendix to keep ready

- architecture and domain diagrams
- status matrix from `FEATURE_INVENTORY.md`
- runtime health/migration/test results
- canonical property aggregate checks
- pricing/runtime entitlement table
- roadmap with explicit IMPLEMENTED/PARTIAL/PLANNED labels
