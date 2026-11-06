# StayMaint 5–10 Minute Product Demo Script

> ขอบเขตเวลา: รายงานนี้บันทึก audit baseline ก่อนงานปรับปรุง Demo ใน commit นี้ จึงไม่ใช่สถานะล่าสุดของฟีเจอร์ Demo ทุกส่วน
>
> แก้ไขข้อค้นพบ scheduler: `backend/myLubd/entrypoint.sh` มี cron สำหรับ PM LINE reminders (09:00), daily summary (23:00) และ Demo reset ทุก 30 นาทีอยู่แล้ว ข้อความด้านล่างที่กล่าวว่าไม่พบ scheduler ให้ตีความว่า **ยังไม่ยืนยันผลการรันจริงและยังไม่พบ schedule สำหรับ PM master-plan materialization** ไม่ใช่ไม่มี cron. `scripts/backup.sh` มีอยู่ แต่ target `docker exec backend` ต่างจากชื่อ container ที่ตรวจพบ (`django-backend`); การสำรองตามเวลาและ restore ยัง NOT VERIFIED.

## Recommended mode

ใช้ **Public Demo** เป็นหลักเพราะไม่ต้อง Login, ใช้ PostgreSQL แยก และข้อมูล sanitized. ใช้ production-authenticated pages เฉพาะช่วงเสริม หากมี demo tenant/account ที่เตรียมไว้และไม่มีข้อมูลแขกจริง.

Runtime prerequisite ที่ยืนยันแล้ว: Chinatown Demo มี 9 rooms, 10 categories, 1 area, 13 jobs, 4 inventory items, 2 PM display records; reset 30 นาที.

## Presenter setup (ก่อนเริ่ม)

- เปิด browser incognito; ปิด password manager popups/notifications.
- ใช้ desktop 1440×900 สำหรับส่วน management และโทรศัพท์/viewport 390×844 สำหรับ technician flow.
- เปิด `/demo/` ล่วงหน้าและตรวจว่าหน้าโหลดข้อมูลได้.
- ห้ามใช้ production guest name, room occupancy, email, token หรือ webhook data.
- เตรียมไฟล์ภาพ sanitized JPEG/PNG/WebP ต่ำกว่า 3 MB จำนวน 2 รูป.
- สร้างงานใหม่ระหว่าง demo เพราะ reset อาจลบงานเดิม.

## Main 8-minute flow

| Time | Route | Feature / status | Safe steps | Expected result | Known limitation |
|---:|---|---|---|---|---|
| 0:00–0:45 | `/demo/` | Demo dashboard — DEMO ONLY | ชี้ property Chinatown, KPI, recent jobs, PM/inventory cards | live isolated counts render | PM card is display-only |
| 0:45–2:30 | `/demo/create-job/` | Create job — DEMO ONLY | เลือก TH/EN; title “Air-condition not cooling”; priority High; room 402; category HVAC; before photo | creates `DWEB…` job in demo DB and navigates to My Jobs/detail | technician is auto-selected; not full assignment workflow |
| 2:30–3:15 | `/demo/my-jobs/` | Technician queue — DEMO ONLY | ค้นหา room/job/category; เปิดงานที่เพิ่งสร้าง | job appears in current demo session | “My” is browser/demo-session concept |
| 3:15–4:30 | `/demo/jobs/{jobId}/` | Work execution — DEMO ONLY | เปลี่ยน Pending→In Progress; เพิ่ม comment | status and comment persist in isolated DB | only linear status path |
| 4:30–5:30 | same | Complete + evidence — DEMO ONLY | upload sanitized after photo; complete | completed timestamp and after image shown | no reassignment/checklist/parts in public demo |
| 5:30–6:45 | `/demo/report/` | Demo reporting — DEMO ONLY | refresh; show KPI/distributions/category/room; export CSV or Print/PDF | report includes newly created job | simplified report, no entitlement/auth boundary |
| 6:45–7:30 | `/demo/` | Operational context | show PM and low-stock cards | audience sees corrective + planned work context | cards are not editable flows |
| 7:30–8:00 | — | Close | summarize property scope, evidence, accountability, reporting | clear business narrative | avoid roadmap claims as existing |

## Optional authenticated extension (2–4 minutes)

Use only a sanitized demo tenant.

| Route | Feature | Actual status | Data prerequisite | Safe action | Limitation |
|---|---|---|---|---|---|
| `/auth/login/` | Auth0 login | IMPLEMENTED | provisioned Auth0 demo identity | sign in | do not expose email/password |
| `/dashboard` | Management dashboard | IMPLEMENTED | active property + jobs | select property; show KPI/room/category/technician | overdue is heuristic |
| `/dashboard/jobs-report` | Production report/export | IMPLEMENTED | Pro/Enterprise entitlement | filter date/category/user; export CSV | Excel/PDF client-side |
| `/dashboard/preventive-maintenance/plans` | PM master plans | IMPLEMENTED | Pro/Enterprise; seeded plan | open plan and schedule | do not claim scheduler is verified |
| `/dashboard/preventive-maintenance/schedule` | PM calendar | IMPLEMENTED | projected/generated occurrences | explain projected vs generated | ensure data is pre-seeded |
| `/dashboard/machines/{machine_id}` | Equipment history | IMPLEMENTED | sanitized machine/history | show detail and PM history | avoid incomplete assets |
| `/dashboard/settings/users` | Roles/invitations | IMPLEMENTED | owner/admin demo identity | show roles/property grants, do not send invite | global pending-email caveat |

## Do not demonstrate live

- Production billing checkout/payment (Stripe test mode)
- Portfolio/property comparison dashboard (planned)
- Full PM checklist execution (UI incomplete)
- Email/LINE delivery unless a dedicated sandbox destination has been independently verified
- Deleting, importing or resetting production data
- Admin/platform screens containing tenant/user/webhook details

## Presenter talking points

1. “StayMaint keeps each hotel property as the operational boundary.”
2. “Engineering teams can capture the issue, room/category, priority and photo evidence from a phone.”
3. “The job follows a visible status flow and preserves comments and repair evidence.”
4. “Managers see live workload and can export operational reports.”
5. “Recurring PM plans, equipment history and scheduling exist in the authenticated product; checklist execution automation is the next maturity step.”
6. “This public demo uses an isolated database and automatically resets; it is not production guest data.”

## Failure fallback

- If image upload fails, use a pre-seeded job; sample SVG evidence is supplied by demo fallback.
- If a reset occurs, reload `/demo/`; seeded data is restored.
- If authenticated environment is unavailable, stop after `/demo/report/` and use the architecture/PM screenshots checklist—do not simulate a successful login.
