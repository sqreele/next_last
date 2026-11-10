import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formUrl = new URL(
  "../app/components/preventive/PreventiveMaintenanceForm.tsx",
  import.meta.url,
);

test("custom PM frequency leaves Scheduled unset", async () => {
  const form = (await Promise.all([
    readFile(formUrl, "utf8"),
    readFile(new URL("../app/components/preventive/PMTemplateSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/preventive/PMScheduleSection.tsx", import.meta.url), "utf8"),
  ])).join("\n");

  assert.match(
    form,
    /if \(templateFrequency === "custom"\) \{[\s\S]*?setFieldValue\("scheduled_date", ""\)/,
  );
  assert.match(
    form,
    /if \(nextFrequency === "custom"\) \{[\s\S]*?setFieldValue\("scheduled_date", ""\)/,
  );
  assert.match(
    form,
    /if \(!values\.frequency \|\| !values\.scheduled_date\) \{\s*return null;/,
  );
});
