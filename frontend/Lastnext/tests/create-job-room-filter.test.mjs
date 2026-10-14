import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("create job matches rooms against both public and numeric property identifiers", () => {
  const form = read("app/components/jobs/CreateJobForm.tsx");

  assert.match(
    form,
    /if \(activePropertyId\) identifiers\.add\(activePropertyId\)/,
  );
  assert.match(
    form,
    /if \(activePropertyNumericId\) identifiers\.add\(activePropertyNumericId\)/,
  );
  assert.match(
    form,
    /return roomBelongsToProperty\(room, activePropertyIdentifiers\)/,
  );
  assert.doesNotMatch(
    form,
    /String\(room\.property_id\) === activePropertyNumericId/,
  );
});
