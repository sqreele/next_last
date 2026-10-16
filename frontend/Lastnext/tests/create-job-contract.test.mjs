import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("create job pre-uploads and submits distinct before and after image tokens", () => {
  const form = read("app/components/jobs/CreateJobForm.tsx");
  const uploader = read("app/components/jobs/ImmediateImageUpload.tsx");
  assert.match(form, /formData\.append\("before_image_tokens", token\)/);
  assert.match(form, /formData\.append\("after_image_tokens", token\)/);
  assert.match(uploader, /"\/api\/jobs\/pending-images"/);
  assert.match(uploader, /compressImage/);
  assert.doesNotMatch(form, /formData\.append\("user_id"/);
  assert.doesNotMatch(form, /formData\.append\("images", file\)/);
});

test("create job requests only active rooms and treats area as an alternative location", () => {
  const form = read("app/components/jobs/CreateJobForm.tsx");
  assert.match(form, /is_active: "true"/);
  assert.match(form, /Boolean\(values\.area_id\)/);
  assert.match(form, /floorDisabledByArea/);
  assert.doesNotMatch(form, /\.\.\.\(areaId \? \{ area_id: areaId \} : \{\}\)/);
});

test("mobile incomplete-step navigation uses real section targets", () => {
  const form = read("app/components/jobs/CreateJobForm.tsx");
  assert.match(form, /target: "cj-step-category"/);
  assert.match(form, /firstIncompleteTarget/);
  assert.doesNotMatch(form, /`cj-step-\$\{firstIncomplete\}`/);
});

test("create job has one localized page header and one job-type control", () => {
  const page = read("app/dashboard/create-job/page.tsx");
  const form = read("app/components/jobs/CreateJobForm.tsx");
  assert.doesNotMatch(page, /<PageHeader/);
  assert.doesNotMatch(form, /<Checkbox/);
  assert.match(form, /JOB_TYPES\.map/);
});
