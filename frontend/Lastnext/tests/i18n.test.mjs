import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  interpolateTranslation,
  resolveClientLocale,
} from "../app/lib/i18n/runtime.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dictionarySource = read("app/lib/i18n/dictionary.ts");
const providerSource = read("app/lib/i18n/LocaleProvider.tsx");
const layoutSource = read("app/layout.tsx");
const toggleSource = read("app/components/i18n/LocaleToggle.tsx");
const dashboardSource = read("app/dashboard/ImprovedDashboard.tsx");
const inventorySource = read("app/dashboard/inventory/page.tsx");
const scheduleSource = read("app/dashboard/preventive-maintenance/schedule/PMScheduleCalendar.tsx");
const statusBadgeSource = read("app/components/StatusBadge.tsx");

function dictionaryBlock(start, end) {
  return dictionarySource.slice(dictionarySource.indexOf(start), dictionarySource.indexOf(end));
}

function entries(block) {
  return [...block.matchAll(/^\s*'([^']+)'\s*:\s*(.+),$/gm)].map(
    ([, key, value]) => [key, value],
  );
}

const enEntries = entries(dictionaryBlock("const en =", "type DictKey ="));
const thEntries = entries(dictionaryBlock("const th:", "export type LocaleDictionary"));
const en = new Map(enEntries);
const th = new Map(thEntries);

test("default locale is English", () => {
  assert.match(dictionarySource, /DEFAULT_LOCALE = 'en'/);
  assert.equal(resolveClientLocale(null, "en", ["en", "th"]), "en");
});

test("switch EN to TH resolves immediately", () => {
  assert.equal(resolveClientLocale("th", "en", ["en", "th"]), "th");
  assert.match(toggleSource, /onClick=\{\(\) => setLocale\(code\)\}/);
});

test("switch TH to EN resolves immediately", () => {
  assert.equal(resolveClientLocale("en", "th", ["en", "th"]), "en");
});

test("active selector state is exposed", () => {
  assert.match(toggleSource, /data-locale=\{locale\}/);
  assert.match(toggleSource, /aria-current=\{locale === code/);
});

test("root provider preserves locale across navigation", () => {
  assert.match(layoutSource, /<LocaleProvider initialLocale=\{initialLocale\}>/);
  assert.doesNotMatch(read("app/dashboard/layout.tsx"), /<LocaleProvider/);
});

test("refresh persistence uses localStorage and an SSR-readable cookie", () => {
  assert.match(providerSource, /localStorage\.setItem\(LOCALE_STORAGE_KEY, next\)/);
  assert.match(providerSource, /document\.cookie = `\$\{LOCALE_COOKIE_KEY\}=\$\{next\}/);
  assert.match(layoutSource, /cookieStore\.get\('pcms-locale'\)/);
});

test("Dashboard uses translated representative text", () => {
  assert.match(dashboardSource, /t\('dashboard\.title'\)/);
  assert.match(dashboardSource, /t\('kpi\.totalJobs'\)/);
});

test("Inventory labels use translations", () => {
  assert.match(inventorySource, /t\("inventory\.addTitle"\)/);
  assert.match(inventorySource, /t\("inventory\.showing"/);
});

test("PM Schedule labels and dates use the selected locale", () => {
  assert.match(scheduleSource, /t\("pmSchedule\.title"\)/);
  assert.match(scheduleSource, /th-TH-u-ca-gregory/);
  assert.doesNotMatch(scheduleSource, /toLocaleDateString\("en-US"/);
});

test("canonical job statuses map to translated labels", () => {
  for (const status of ["pending", "in_progress", "waiting_sparepart", "completed", "cancelled", "overdue", "scheduled", "waiting_vendor"]) {
    assert.match(statusBadgeSource, new RegExp(`${status}: \\"status\\.`));
  }
});

test("raw PM status code is not rendered", () => {
  assert.doesNotMatch(scheduleSource, /Status: \{item\.calendar_status/);
  assert.match(scheduleSource, /<StatusBadge[^>]*status=\{/);
});

test("missing interpolation values remain safe", () => {
  assert.equal(interpolateTranslation("Room {room} / {floor}", { room: 315 }), "Room 315 / {floor}");
  assert.match(providerSource, /getDictionary\(DEFAULT_LOCALE\)\[key\] \?\? key/);
});

test("Thai Unicode content is present and intact", () => {
  assert.match(th.get("status.inProgress"), /กำลังทำ/);
  assert.equal(interpolateTranslation("ห้อง {room}", { room: 315 }), "ห้อง 315");
});

test("user-entered inventory text remains unchanged", () => {
  assert.match(inventorySource, /\{item\.name\}/);
  assert.match(inventorySource, /value=\{newItem\.description\}/);
});

test("Property names remain API/user values", () => {
  assert.match(scheduleSource, /visibleData\?\.property_name \|\| activeProperty\?\.name/);
  assert.match(inventorySource, /item\.property_name/);
});

test("English and Thai dictionaries have matching unique keys and placeholders", () => {
  assert.equal(new Set(enEntries.map(([key]) => key)).size, enEntries.length, "duplicate EN key");
  assert.equal(new Set(thEntries.map(([key]) => key)).size, thEntries.length, "duplicate TH key");
  assert.deepEqual([...en.keys()].sort(), [...th.keys()].sort());
  for (const key of en.keys()) {
    const vars = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(vars(en.get(key)), vars(th.get(key)), `placeholder mismatch: ${key}`);
  }
});
