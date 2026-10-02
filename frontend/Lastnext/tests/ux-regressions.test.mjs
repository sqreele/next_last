import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("icon-only workflow controls expose accessible names", () => {
  const areas = read("app/dashboard/areas/AreasClient.tsx");
  const machines = read("app/dashboard/machines/page.tsx");
  const jobActions = read("app/components/jobs/JobActions.tsx");

  assert.match(areas, /aria-label={`Edit \${area\.name}`}/);
  assert.match(areas, /aria-label={`Delete \${area\.name}`}/);
  assert.match(machines, /aria-label="Grid view"/);
  assert.match(machines, /aria-label="List view"/);
  assert.match(machines, /aria-pressed=\{viewMode === "grid"\}/);
  assert.match(jobActions, /aria-label="Open job actions"/);
});

test("registration stays a server component and mobile KPI copy is localized", () => {
  const register = read("app/auth/register/page.tsx");
  const mobileKpis = read("app/components/dashboard/MobileKpiStrip.tsx");

  assert.doesNotMatch(register, /^['"]use client['"];?/);
  assert.match(register, /export default async function RegisterPage/);
  assert.doesNotMatch(mobileKpis, />\s*Open\s*</);
  assert.match(mobileKpis, /t\("dashboard\.kpiSummary"\)/);
  assert.match(mobileKpis, /t\("dashboard\.vsLastWeek"\)/);
});

test("dialog and toast primitives preserve caller styles and accessible close labels", () => {
  const dialog = read("app/components/ui/dialog.tsx");
  const toast = read("app/components/ui/toast.tsx");

  assert.match(dialog, /cn\("fixed inset-0[\s\S]*?className\)/);
  assert.match(dialog, /cn\("text-base font-semibold[\s\S]*?className\)/);
  assert.match(toast, /cn\(toastVariants\(\{ variant \}\), className\)/);
  assert.match(toast, /Close notification/);
});

test("machine filtering includes partial machine-name matches", () => {
  const models = read("app/lib/preventiveMaintenanceModels.ts");
  assert.match(
    models,
    /return machineIdMatch \|\| machineIdCaseInsensitive \|\| nameMatch \|\| nameCaseInsensitive \|\| namePartialMatch/,
  );
});

test("create-job mobile submit bar stays above iPhone navigation and safe area", () => {
  const form = read("app/components/jobs/CreateJobForm.tsx");
  const mobileNav = read("app/components/ui/mobile-nav.tsx");

  assert.match(
    form,
    /bottom:\s*"calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)"/,
  );
  assert.match(form, /fixed bottom-\[4\.5rem\][^\n]*z-40/);
  assert.match(mobileNav, /fixed inset-x-0 bottom-0 z-50/);
  assert.doesNotMatch(
    form,
    /className="fixed bottom-0 left-0 right-0 z-20/,
  );
});
