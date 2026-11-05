import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/demo/DemoClient.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/demo/page.tsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../app/demo/report/DemoReportClient.tsx", import.meta.url), "utf8");
const reportPage = readFileSync(new URL("../app/demo/report/page.tsx", import.meta.url), "utf8");

test("public demo is no-login and connects only through the isolated demo API", () => {
  assert.doesNotMatch(source, /useSessionGuard/);
  assert.match(source, /fetch\("\/api\/demo\//);
  assert.match(source, /Sandbox Demo/);
  assert.match(source, /Demo DB connected/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

test("public demo provides interactive workflow and sample operations data", () => {
  assert.match(source, /DEMO-CT-0001/);
  assert.match(source, /advanceJob/);
  assert.match(source, /Preventive Maintenance/);
  assert.match(source, /Inventory/);
});

test("public demo can create a local work order and show it immediately", () => {
  assert.match(source, /Create Demo Job/);
  assert.match(source, /const createJob =/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /setJobs\(\(current\) => \[result, \.\.\.current\]\)/);
});

test("public demo report uses live demo data and supports presentation exports", () => {
  assert.match(source, /href="\/demo\/report\/"/);
  assert.match(report, /fetch\("\/api\/demo\//);
  assert.match(report, /Export CSV/);
  assert.match(report, /Print \/ PDF/);
  assert.match(report, /Work Order Detail/);
  assert.doesNotMatch(report, /useSessionGuard/);
  assert.match(reportPage, /robots: \{ index: false, follow: false \}/);
});
