# App Structure Audit Against Google-aligned Engineering Standards

**Date:** March 27, 2026  
**Scope:** Frontend (Next.js App Router) + Backend (Django REST)

---

## 1) Executive Summary

The repository has a workable full-stack structure (clear `frontend/` and `backend/` split, framework-standard layout, and environment-driven configs). It is production-capable, but it does **not yet fully meet Google-style engineering standards** for consistency, maintainability, and quality gates.

### Overall score (heuristic)
- **Architecture clarity:** 7/10
- **Naming and structure consistency:** 5/10
- **Quality gates (lint/test/CI rigor):** 4/10
- **Security and operational baseline:** 7/10
- **Overall Google-alignment:** **5.8/10**

---

## 2) What already aligns well

1. **Clear top-level separation of concerns**
   - Distinct frontend and backend applications under `frontend/Lastnext` and `backend/myLubd`.
2. **Framework-native organization**
   - Next.js App Router routing via `app/` and route handlers in `app/api/*`.
   - Django project/app structure in `src/myLubd` and `src/myappLubd`.
3. **Security baseline present**
   - Production HTTP hardening and secure cookies in Django settings.
4. **Operational hints present**
   - Health endpoint exists (`/health/`).
   - Multiple deployment/config docs indicate operational awareness.

---

## 3) Gaps versus Google-style standards

## 3.1 Inconsistent naming and route taxonomy (High)

Google-style codebases strongly prefer predictable naming conventions and single canonical paths. Current examples show mixed styles:
- `dashboard/Preventive_maintenance/` (mixed case + underscore)
- `dashboard/preventive-maintenance/` (kebab-case)
- `dashboard/createJob/` and `dashboard/myJobs/` (camelCase in URL segments)
- both `chartdashboad` and `chartdashboard` exist

**Impact:** onboarding friction, weak URL predictability, and higher long-term maintenance cost.

---

## 3.2 UI/domain boundaries are still mixed (Medium)

The frontend has strong reuse building blocks, but domain code and view code are interwoven across:
- `app/dashboard/*`
- `app/components/*`
- `app/lib/*` (services, state, hooks, utils)

This is common in growing apps, but Google-style scalability favors stricter layering (feature/domain modules with explicit boundaries) to reduce accidental coupling.

---

## 3.3 Quality gates are not strict enough (High)

`next.config.mjs` currently disables build blocking for lint (`ignoreDuringBuilds: true`). This is practical short-term, but contrary to strong quality-bar practices where lint/type/test failures block promotion.

Also, frontend `package.json` has no explicit test/lint scripts visible, limiting enforceable quality checks in CI.

---

## 3.4 Backend module granularity indicates monolith pressure (Medium)

Django app `myappLubd` has many responsibilities concentrated in large shared modules (`views.py`, `models.py`, `services.py`, `serializers.py`) and a long migration history with multiple merge migrations. This is manageable now, but future complexity risk is high without domain decomposition.

---

## 3.5 Repository hygiene and governance concerns (Medium)

Root contains many ad-hoc summary/fix markdowns and SQL backup artifacts. While useful operationally, this reduces signal-to-noise for contributors and makes standardized governance harder.

---

## 4) Recommended target structure (Google-aligned)

## 4.1 Frontend

Adopt a feature-first structure under `app/` with explicit module boundaries:

- `app/(public)/...`
- `app/(auth)/...`
- `app/(dashboard)/...`
- `features/jobs/{api,components,hooks,types}`
- `features/preventive-maintenance/{...}`
- `shared/{ui,utils,config}`

And enforce one URL style: **kebab-case only**.

## 4.2 Backend

Split `myappLubd` by bounded context (logical modules) while staying within Django conventions:
- `apps/jobs/`
- `apps/preventive_maintenance/`
- `apps/assets/`
- `apps/users/`
- `apps/reports/`

Move business logic from views to service-layer modules per domain, with narrower serializers per API surface.

## 4.3 Quality and delivery

- Enable lint/type checks as merge gates.
- Add consistent scripts: `lint`, `typecheck`, `test`, `test:integration`.
- Add CI pipeline stages: format/lint → unit tests → build → (optional) e2e smoke.

## 4.4 Repo governance

- Move backups and one-off diagnostics into dedicated folders (`ops/backups/`, `docs/incident-notes/`).
- Keep root minimal (`README`, core infra manifests, high-value docs only).

---

## 5) 30-60-90 day improvement plan

## 30 days (quick wins)
1. Standardize route naming policy and remove/redirect legacy path variants.
2. Turn lint warnings into visible CI feedback (even if non-blocking initially).
3. Introduce canonical `scripts` in frontend/backend for lint/test/typecheck.

## 60 days (structural)
1. Refactor frontend into feature modules with ownership boundaries.
2. Introduce backend domain split (start with jobs + preventive maintenance).
3. Add architecture decision records (ADRs) for naming, module boundaries, and API versioning.

## 90 days (hardening)
1. Make lint/type/test fully blocking on main branch.
2. Add integration tests for critical app flows.
3. Establish deprecation policy for routes and APIs.

---

## 6) Evidence reviewed

- `frontend/Lastnext/app/` directory structure and route files
- `frontend/Lastnext/package.json`
- `frontend/Lastnext/next.config.mjs`
- `frontend/Lastnext/middleware.ts`
- `backend/myLubd/src/myLubd/settings.py`
- `backend/myLubd/src/myLubd/urls.py`
- `backend/myLubd/src/myappLubd/` module and migration structure

---

## 7) ควรแก้ไขตรงไหนบ้าง (Actionable Checklist)

ด้านล่างคือรายการที่ “ควรเริ่มทำทันที” เรียงตามความคุ้มค่าและผลกระทบ:

### P0 — แก้ทันที (สัปดาห์นี้)

1. **ทำ naming ให้เป็นมาตรฐานเดียว (kebab-case ทั้งหมด)**
   - แก้เส้นทางที่ปนรูปแบบ: `createJob`, `myJobs`, `Preventive_maintenance`, `chartdashboad`
   - ทำ redirect จาก legacy routes ไป canonical routes

2. **เปิด quality gate ขั้นต่ำใน CI**
   - เลิกพึ่ง `ignoreDuringBuilds: true` เป็นระยะยาว
   - เพิ่มคำสั่งมาตรฐานใน `package.json`: `lint`, `typecheck`, `test`

3. **ล็อกโครงสร้างโฟลเดอร์ฝั่ง frontend**
   - หยุดเพิ่มโค้ดใหม่แบบกระจาย `app/components/lib` โดยไม่กำหนด owner
   - ตั้งกติกา feature-first สำหรับงานใหม่

### P1 — แก้ระยะสั้น (2–4 สัปดาห์)

4. **แยก backend ตามโดเมนธุรกิจ**
   - เริ่มจาก `jobs` และ `preventive_maintenance`
   - ลดการพึ่งไฟล์ใหญ่เดียว (`views.py`, `services.py`, `serializers.py`)

5. **เก็บ repository hygiene**
   - ย้ายไฟล์ backup และสรุป incident ไปโฟลเดอร์เฉพาะ
   - ทำ root directory ให้เหลือเฉพาะไฟล์หลักที่จำเป็น

6. **เพิ่ม ADR (Architecture Decision Records)**
   - ระบุชัดเจนเรื่อง route naming, folder ownership, API versioning

### P2 — แก้ระยะกลาง (1–3 เดือน)

7. **ทำ test pyramid ให้ครบ**
   - unit tests (business logic), integration tests (API), smoke e2e (critical paths)

8. **ทำ deprecation policy**
   - ทุก route/API ที่จะเลิกใช้ต้องมีช่วงประกาศ, redirect และวันสิ้นสุดที่ชัดเจน

9. **ตั้ง owner ต่อโมดูล**
   - feature owner + reviewer matrix เพื่อคุมคุณภาพสถาปัตยกรรมต่อเนื่อง

### นิยามว่า “แก้แล้วสำเร็จ” (Definition of Done)

- ไม่มี route ใหม่ที่ไม่ใช่ kebab-case
- CI fail เมื่อ lint/typecheck fail
- มี test ขั้นต่ำสำหรับเส้นทางหลัก (login, dashboard, jobs CRUD)
- ลดการแก้ไฟล์ใหญ่รวมศูนย์ลงอย่างต่อเนื่อง (แยกตามโดเมน)
