import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PM schedule navigation keeps exact contiguous date windows", async () => {
  const schedule = await source("../app/dashboard/preventive-maintenance/schedule/PMScheduleCalendar.tsx");
  assert.match(schedule, /params\.set\("from", toISODate\(activeAnchor\)\)/);
  assert.doesNotMatch(schedule, /params\.set\("from", toISODate\(startOfWeekMonday\(activeAnchor\)\)\)/);
  assert.match(schedule, /day\.setDate\(gridStart\.getDate\(\) \+ index\)/);
});

test("PM list sends sorting and date ranges to the paginated backend", async () => {
  const page = await source("../app/dashboard/preventive-maintenance/page.tsx");
  const store = await source("../app/lib/stores/usePreventiveMaintenanceStore.ts");
  const backend = await source("../../../backend/myLubd/src/myappLubd/views.py");
  assert.match(page, /date_from: start_date/);
  assert.match(page, /date_to: end_date/);
  assert.match(page, /ordering: getServerOrdering\(sortBy, sortOrder\)/);
  assert.match(page, /fields\[field\]\},pm_id/);
  assert.doesNotMatch(page, /\[\.\.\.maintenanceItems\]\.sort/);
  assert.match(store, /ordering\?: string/);
  assert.match(backend, /'pm_id', 'scheduled_date'.*'status_sort', 'machine_sort'/s);
  assert.match(backend, /scheduled_date__date__lte=date_to/);
});

test("PM bulk deletion applies each successful response to the latest store state", async () => {
  const actions = await source("../app/lib/hooks/usePreventiveMaintenanceActions.ts");
  assert.match(actions, /usePreventiveMaintenanceStore\.getState\(\)/);
  assert.match(actions, /latestState\.maintenanceItems\.filter/);
  assert.match(actions, /Math\.max\(0, latestState\.totalCount - 1\)/);
});

test("PM date filters prevent and announce invalid ranges", async () => {
  const filters = await source("../app/components/preventive/list/FilterPanel.tsx");
  assert.match(filters, /max=\{currentFilters\.endDate \|\| undefined\}/);
  assert.match(filters, /min=\{currentFilters\.startDate \|\| undefined\}/);
  assert.match(filters, /role="alert"/);
  assert.match(filters, /t\("pm\.invalidDateRange"\)/);
});

test("PM destructive dialogs expose modal semantics and keyboard handling", async () => {
  const modal = await source("../app/components/preventive/list/DeleteModal.tsx");
  const list = await source("../app/dashboard/preventive-maintenance/page.tsx");
  assert.match(modal, /role="alertdialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.doesNotMatch(list, /window\.confirm/);
  assert.match(list, /selectedCount=\{selectedItems\.length\}/);
});

test("PM dashboard is localized and uses mobile-safe responsive layouts", async () => {
  const dashboard = await source("../app/components/preventive/PreventiveMaintenanceDashboard.tsx");
  assert.match(dashboard, /useLocale\(\)/);
  assert.match(dashboard, /th-TH-u-ca-gregory/);
  assert.match(dashboard, /grid-cols-1 gap-3 min-\[420px\]:grid-cols-2/);
  assert.match(dashboard, /t\("pmDashboard\.completionRate"\)/);
  assert.match(dashboard, /determinePMStatus\(item\)/);
  assert.doesNotMatch(dashboard, /item\.status \|\| determinePMStatus/);
});
