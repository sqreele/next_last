import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PM master write controls use the server-authorized management capability", async () => {
  const list = await source("../app/dashboard/preventive-maintenance/plans/page.tsx");
  const detail = await source("../app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceDetailLoader.tsx");

  for (const page of [list, detail]) {
    assert.match(page, /can_manage_pm_master/);
    assert.match(page, /canManagePMMaster/);
  }
  assert.match(list, /canManagePMMaster && <Link[^>]+plans\/create/);
  assert.match(list, /canManagePMMaster && <Link[^>]+\/edit/);
  assert.match(list, /canManagePMMaster && <button[\s\S]*?setDeletePlan/);
  assert.match(detail, /plan\.can_manage_pm_master === true/);
});

test("PM master create and edit routes fail closed for non-management users", async () => {
  const form = await source("../app/components/preventive/PMMasterPlanForm.tsx");
  assert.match(form, /can_manage_pm_master/);
  assert.match(form, /if \(!canManagePMMaster\)/);
  assert.match(form, /cannot create or edit them/);
  assert.doesNotMatch(form, /statsResponse\.data\?\.can_operate === true/);
});

test("the server contract exposes one PM-master management field", async () => {
  const service = await source("../app/lib/PreventiveMaintenanceService.ts");
  assert.match(service, /can_manage_pm_master\?: boolean/);
});
