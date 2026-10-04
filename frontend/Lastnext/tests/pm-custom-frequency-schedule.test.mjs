import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formUrl = new URL(
  "../app/components/preventive/PreventiveMaintenanceForm.tsx",
  import.meta.url,
);

test("custom PM frequency leaves Scheduled unset", async () => {
  const form = await readFile(formUrl, "utf8");

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
