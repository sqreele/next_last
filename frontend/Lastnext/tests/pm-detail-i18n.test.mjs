import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceClient.tsx");
const loader = read("app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceDetailLoader.tsx");
const dictionary = read("app/lib/i18n/dictionary.ts");

function localeBlock(start, end) {
  return dictionary.slice(dictionary.indexOf(start), dictionary.indexOf(end));
}

const en = localeBlock("const en =", "type DictKey =");
const th = localeBlock("const th:", "export type LocaleDictionary");

test("English PM detail labels are defined", () => {
  for (const label of ["Preventive Maintenance", "Maintenance ID", "Scheduled", "Completed", "Assigned To", "Maintenance Title", "Procedure", "Notes", "Associated Machines"]) {
    assert.match(en, new RegExp(`: '${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'`));
  }
});

test("the mounted detail route reacts to the shared locale context", () => {
  assert.match(client, /const \{ locale, t \} = useLocale\(\)/);
  assert.match(loader, /const \{ locale, t \} = useLocale\(\)/);
  assert.match(client, /maintenanceData\.pmtitle \|\| t\("pmDetail\.defaultTitle"\)/);
});

for (const [status, key] of [
  ["pending", "status.pending"],
  ["in_progress", "status.inProgress"],
  ["completed", "status.completed"],
  ["cancelled", "status.cancelled"],
  ["overdue", "status.overdue"],
]) {
  test(`${status} has English and Thai localized display text`, () => {
    assert.match(en, new RegExp(`'${key}'`));
    assert.match(th, new RegExp(`'${key}'`));
    assert.match(client, /<StatusBadge status=\{taskStatus\}/);
  });
}

test("PM ID remains an unchanged API value", () => {
  assert.match(client, /\{maintenanceData\.pm_id\}/);
  assert.match(client, /t\("pmDetail\.evidenceSubtitle", \{ id: maintenanceData\.pm_id \}\)/);
});

test("property values remain unchanged", () => {
  assert.match(client, /\{maintenanceData\.property_id\}/);
  assert.match(loader, /\{masterPlan\.title\}/);
});

test("machine and user-entered values remain unchanged", () => {
  assert.match(client, /machineName \|\| t\("pmDetail\.unnamedMachine"\)/);
  assert.match(client, /\{maintenanceData\.procedure\}/);
  assert.match(client, /\{maintenanceData\.notes\}/);
  assert.match(client, /\{assignedUserInfo\.display\}/);
});

test("language switching does not require a reload", () => {
  assert.doesNotMatch(client, /window\.location\.reload/);
  assert.doesNotMatch(loader, /window\.location\.reload/);
});

test("raw PM status codes are not rendered", () => {
  assert.doesNotMatch(client, />\s*\{taskStatus\}\s*</);
  assert.doesNotMatch(loader, /generated_pm_status \|\| 'pending'\}\s*</);
  assert.match(loader, /<StatusBadge status=\{masterPlan\.generated_pm_status \|\| 'pending'\}/);
});

test("all PM detail translation keys exist in both locales", () => {
  const sources = `${client}\n${loader}`;
  const keys = [...sources.matchAll(/\bt\(["']([^"']+)["']/g)].map((match) => match[1]);
  for (const key of new Set(keys)) {
    assert.match(en, new RegExp(`'${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'`), `missing EN key ${key}`);
    assert.match(th, new RegExp(`'${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'`), `missing TH key ${key}`);
  }
});

test("buttons and confirmation dialogs use live translations", () => {
  for (const key of ["action.edit", "action.delete", "pmDetail.markComplete", "pmDetail.backToPm", "pmDetail.confirmDelete", "pmDetail.confirmComplete"]) {
    assert.match(client, new RegExp(`t\\(["']${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["']`));
  }
  assert.match(loader, /t\('action\.cancel'\)/);
});

test("Thai PM detail Unicode is intact", () => {
  assert.match(th, /'pmDetail\.defaultTitle': 'งานบำรุงรักษาเชิงป้องกัน'/);
  assert.match(th, /'pmDetail\.assignedTo': 'มอบหมายให้'/);
  assert.match(th, /'status\.overdue': 'เกินกำหนด'/);
});
