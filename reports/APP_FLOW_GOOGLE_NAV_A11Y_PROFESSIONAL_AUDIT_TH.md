# App Flow Audit (Google-aligned): Navigation, Accessibility, Professional Look

วันที่วิเคราะห์: 27 มีนาคม 2026

## 1) Executive Summary

แอปมีฐานโครงสร้างที่ดี (Next.js App Router, มี auth guard, มี responsive nav แยก mobile/tablet) แต่ยังมี “ความไม่สม่ำเสมอของเส้นทางการนำทาง (navigation consistency)” และ “ช่องว่างด้าน Accessibility เชิงปฏิบัติ” ที่ทำให้ประสบการณ์รวมยังไม่ถึงระดับ Google-quality ในมุมการใช้งานจริงระดับองค์กร

**ภาพรวมคะแนน (ประเมินเชิง heuristic):**
- Navigation clarity: **6.5/10**
- Accessibility readiness: **5.5/10**
- Professional/product polish: **6/10**
- Overall Google-alignment: **6/10**

---

## 2) Current App Flow (As-Is)

## 2.1 High-level flow
1. ผู้ใช้เข้า Landing (`/`) แล้วไป Sign-in/Sign-up หรือเข้าหน้า Dashboard ถ้ามี session แล้ว.
2. เส้นทาง protected (`/dashboard/*`) ถูกครอบด้วย `ProtectedRoute` ผ่าน `DashboardWithAuth`.
3. Dashboard หลักแสดงภาพรวมงาน + filter + tabs + list/grid และมี action เช่น refresh/export.

## 2.2 จุดที่ดี (Strengths)
- มี session guard และ fallback state สำหรับ loading/unauthorized ชัดเจน.
- มี responsive navigation แยก mobile/tablet (`mobile-nav.tsx`, `tablet-nav.tsx`).
- มี semantic role บางจุด (`role="navigation"`, `aria-label`) และมีการใช้ `aria-current` สำหรับ active item ใน mobile nav.

---

## 3) Findings: Navigation

## 3.1 Naming/route consistency ยังไม่เป็นระบบเดียว
- มีทั้ง `/dashboard/chartdashboard` และ route legacy `/dashboard/chartdashboad` (สะกดต่างกัน) ซึ่งแม้จะมี redirect แต่สะท้อน technical debt ด้าน information architecture.
- โครง route มี style ปะปน เช่น `myJobs`, `createJob`, `Preventive_maintenance`, `preventive-maintenance` (camelCase + kebab-case + Pascal/snake-like) ทำให้ mental model ของผู้ใช้และทีมพัฒนาไม่คงที่.

**ผลกระทบ:** ผู้ใช้จดจำเส้นทางยากขึ้น, deep-link consistency ลดลง, ดู “ไม่ polished” แบบองค์กร.

## 3.2 Primary navigation ยังไม่มีกลุ่มงาน (task grouping) ชัด
ปัจจุบันเมนูผสม “งานหลัก” และ “action” เช่น Create Job อยู่ระดับเดียวกับ Dashboard/My Jobs ทำให้ลำดับความสำคัญไม่ชัด.

**ข้อเสนอแบบ Google-aligned:**
- Primary nav = Domains (Dashboard, Jobs, Maintenance, Assets, Reports, Profile)
- Secondary nav/FAB = Actions (Create Job, Export)

## 3.3 ไม่มี breadcrumb/multi-level orientation ที่สม่ำเสมอ
มี component breadcrumb ในระบบแต่จาก flow หลักยังไม่เห็นการใช้ต่อเนื่องในหน้าระดับลึก (detail/edit).

---

## 4) Findings: Accessibility

## 4.1 จุดแข็ง
- ใน mobile nav มี `aria-label` และ `aria-current` บน active destination.
- มี loading UI ที่ประกาศ `aria-live="polite"` และ `role="status"` ในหน้าล็อกอิน.

## 4.2 ช่องว่างสำคัญ
1. **Custom tabs ใน Dashboard ไม่ครบ WAI-ARIA tab pattern**
   - ใช้ปุ่มธรรมดา map เอง แทนการใช้ `TabsTrigger`/`TabsContent` pattern อย่างสมบูรณ์
   - ยังไม่เห็น `role="tablist"`, `role="tab"`, `aria-selected`, keyboard arrow navigation แบบมาตรฐานในส่วนที่ custom เอง
2. **Icon-only buttons ใน header ขาด accessible name บางปุ่ม**
   - ปุ่ม refresh/settings ไม่มี `aria-label` ชัดเจนทุกปุ่ม
3. **Landmark hierarchy ยังไม่ชัดทั่วทั้งแอป**
   - มี `<main>` ใน root layout แล้ว แต่ในหน้าใหญ่ควรจัด `<header>`, `<nav>`, `<section aria-labelledby>` ให้ครบและสม่ำเสมอ
4. **Skip link ยังไม่เห็นใน layout หลัก**
   - ควรเพิ่ม “Skip to main content” สำหรับ keyboard/screen reader users

---

## 5) Findings: Professional Look (Not-template feel)

## 5.1 Visual language ปนหลายแนว
มีข้อความ/คอมเมนต์แนว “Instagram-style” หลายจุดใน dashboard ซึ่งขัดกับ positioning แอป B2B โรงแรมระดับมืออาชีพ

**ผลกระทบ:** ความรู้สึกเหมือนนำ template/visual trend มาปรับ มากกว่าภาษาออกแบบเฉพาะผลิตภัณฑ์.

## 5.2 Brand + UX tone ยังไม่ enterprise-consistent
- บางหน้าเป็น gradient-heavy marketing tone (landing/login) ขณะที่ dashboard ใช้ neutral business tone
- การผสม style มากเกินทำให้ product identity ไม่แน่น

## 5.3 Recommendation ด้าน visual system
- กำหนด Design tokens: spacing scale, radius, elevation, state colors, motion duration
- จำกัด accent gradients เฉพาะ marketing surface
- Dashboard ใช้ data-first layout + neutral surfaces + predictable hierarchy

---

## 6) Google-aligned Target Flow (To-Be)

## 6.1 Proposed Information Architecture
- **Dashboard** (overview + alerts + quick actions)
- **Jobs**
  - All Jobs
  - My Jobs
  - Create Job (secondary action/FAB)
  - Job Detail
- **Preventive Maintenance**
  - Schedules
  - Execution
  - Reports
- **Assets** (Machines / Rooms)
- **Reports & Analytics**
- **Profile & Settings**

## 6.2 Navigation model
- Desktop: Left rail (primary) + top app bar (context actions/search)
- Tablet: collapsible navigation drawer
- Mobile: bottom nav 4–5 destinations สูงสุด, action สร้างงานใช้ FAB

## 6.3 Accessibility baseline (ต้องผ่านก่อน scale)
- WCAG 2.2 AA
- Keyboard-only flow ผ่านทุกหน้า
- Focus visibility ชัดเจนทุก interactive element
- Semantic landmarks + heading order ไม่ข้ามระดับ
- Form labels/errors/validation announcements ครบ

---

## 7) 30-60-90 Day Action Plan

## 30 วัน (Quick wins)
1. Route naming standardization (kebab-case ทั้งระบบ)
2. เพิ่ม skip link + landmark discipline ทุกหน้าแกนหลัก
3. แก้ icon-only buttons ให้มี `aria-label` ครบ
4. ปรับ tab interaction ให้ครบ ARIA pattern
5. ลด visual noise/gradient ในหน้าปฏิบัติงานจริง

## 60 วัน (Structural)
1. สร้าง Navigation schema กลาง (single source of truth)
2. แยก Primary vs Secondary actions อย่างเป็นระบบ
3. เพิ่ม breadcrumb + page title strategy แบบสม่ำเสมอ
4. เพิ่ม automated a11y checks (axe/lighthouse CI)

## 90 วัน (Professional polish)
1. Design system governance (tokens + component states)
2. UX writing guideline (microcopy for status/error/empty)
3. End-to-end usability test กับผู้ใช้งานจริง (engineer/supervisor)

---

## 8) Priority Backlog (Implementation-ready)

P0 (Critical):
- ทำ route convention + nav map กลาง
- ปิดช่องว่าง ARIA tabs และ icon buttons
- เพิ่ม skip link และ focus-visible policy

P1 (High):
- ปรับโครง primary/secondary navigation
- เพิ่ม breadcrumb และ page-level context

P2 (Medium):
- ปรับ visual consistency ให้ B2B professional มากขึ้น
- ปรับ motion/transition ให้ subtle และ predictable

---

## 9) Evidence (Files reviewed)
- `frontend/Lastnext/app/layout.tsx`
- `frontend/Lastnext/app/page.tsx`
- `frontend/Lastnext/app/auth/login/page.tsx`
- `frontend/Lastnext/app/dashboard/page.tsx`
- `frontend/Lastnext/app/dashboard/DashboardWithAuth.tsx`
- `frontend/Lastnext/app/dashboard/ImprovedDashboard.tsx`
- `frontend/Lastnext/app/components/ui/mobile-nav.tsx`
- `frontend/Lastnext/app/components/ui/tablet-nav.tsx`
- `frontend/Lastnext/app/components/auth/ProtectedRoute.tsx`
- `frontend/Lastnext/app/dashboard/chartdashboard/page.tsx`
- `frontend/Lastnext/app/dashboard/chartdashboad/page.tsx`

