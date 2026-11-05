import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../app/demo/layout.tsx");
const shell = read("../app/demo/DemoShell.tsx");
const provider = read("../app/demo/DemoProvider.tsx");
const dashboard = read("../app/demo/DemoDashboardClient.tsx");
const createJob = read("../app/demo/create-job/DemoCreateJobClient.tsx");
const jobs = read("../app/demo/jobs/DemoJobsClient.tsx");
const detail = read("../app/demo/jobs/[jobId]/DemoJobDetailClient.tsx");
const report = read("../app/demo/report/DemoReportClient.tsx");

test("public demo uses a production-style workspace without a login guard", () => {
  assert.match(layout, /DemoProvider/);
  assert.match(layout, /DemoShell/);
  assert.doesNotMatch(`${layout}${shell}${provider}`, /useSessionGuard/);
  for (const route of ["Dashboard", "All Jobs", "My Jobs", "Create Job", "Reports"]) assert.match(shell, new RegExp(route));
  assert.match(shell, /Sandbox · No login/);
});

test("demo provider owns the isolated workflow API", () => {
  assert.match(provider, /fetch\("\/api\/demo\//);
  assert.match(provider, /createJob/);
  assert.match(provider, /updateStatus/);
  assert.match(provider, /addComment/);
  assert.match(provider, /reset/);
});

test("create job mirrors production form sections and redirects to My Jobs", () => {
  assert.match(createJob, /1\. Job Information/);
  assert.match(createJob, /2\. Location/);
  assert.match(createJob, /3\. Category & Additional Details/);
  assert.match(createJob, /4\. Evidence/);
  assert.match(createJob, /before_image/);
  assert.match(createJob, /after_image/);
  assert.match(createJob, /router\.push\(`\/demo\/my-jobs/);
});

test("job list and detail support the production navigation flow", () => {
  assert.match(jobs, /All priorities/);
  assert.match(jobs, /All rooms \/ areas/);
  assert.match(jobs, /All categories/);
  assert.match(jobs, /demo\/jobs\/\$\{job\.id\}/);
  assert.match(detail, /Before \/ After Evidence/);
  assert.match(detail, /Start Job/);
  assert.match(detail, /Complete Job/);
  assert.match(detail, /Comments/);
});

test("dashboard and reports remain backed by live demo data", () => {
  assert.match(dashboard, /Recent Maintenance Jobs/);
  assert.match(dashboard, /Preventive Maintenance/);
  assert.match(dashboard, /Inventory Alerts/);
  assert.match(report, /Export CSV/);
  assert.match(report, /Print \/ PDF/);
  assert.match(report, /Work Order Detail/);
  assert.match(report, /งานตาม Category/);
});
