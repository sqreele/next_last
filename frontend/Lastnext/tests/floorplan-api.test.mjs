import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getFloorPlanDefinition,
  listFloorPlanPropertyIds,
} from "../app/lib/floorplans/runtime.mjs";

const routeSource = () => readFile(
  new URL("../app/api/floorplans/[propertyId]/route.ts", import.meta.url),
  "utf8",
);

test("Siam runtime exposes SVG-native floor mappings", () => {
  assert.deepEqual(listFloorPlanPropertyIds(), ["PE17D8D2C"]);

  const plan = getFloorPlanDefinition("pe17d8d2c");
  assert.ok(plan);
  assert.equal(plan.property_id, "PE17D8D2C");
  assert.deepEqual(plan.floors.map((floor) => floor.id), ["L1", "L2", "L3", "L4"]);
  assert.deepEqual(
    plan.floors.map((floor) => floor.svg_url),
    [
      "/floorplans/siam/floor-l1.svg",
      "/floorplans/siam/floor-l2.svg",
      "/floorplans/siam/floor-l3.svg",
      "/floorplans/siam/floor-l4.svg",
    ],
  );
  assert.ok(plan.floors.every((floor) => floor.view_box.length === 4));
  assert.ok(Object.isFrozen(plan));
});

test("runtime includes confirmed operational mappings and explicit cancellations", () => {
  const plan = getFloorPlanDefinition("PE17D8D2C");
  assert.ok(plan);

  const operational = plan.floors.flatMap((floor) => floor.operational_areas);
  assert.deepEqual(
    operational.map(({ zone_id, room_id }) => [zone_id, room_id]),
    [
      ["siam-l1-lobby", 172],
      ["siam-l1-wc-male", 173],
      ["siam-l1-wc-female", 173],
      ["siam-l3-wc-male", 174],
      ["siam-l3-wc-female", 199],
    ],
  );
  assert.ok(operational.every((area) => area.interactive && area.polygon.length >= 3));

  const cancelled = plan.floors.flatMap((floor) => floor.cancelled_mappings);
  assert.deepEqual(
    cancelled.map(({ plan_label, room_id, interactive }) => [plan_label, room_id, interactive]),
    [["106", null, false], ["313", 146, false]],
  );
  assert.equal(
    plan.floors.flatMap((floor) => floor.guest_rooms).some((room) => room.room_id === 146),
    false,
  );
  assert.equal(
    plan.unmapped_operational_records.some((room) => room.room_id === 198 && room.status === "superseded"),
    true,
  );
});

test("runtime rejects unsupported properties", () => {
  assert.equal(getFloorPlanDefinition("UNKNOWN"), null);
  assert.equal(getFloorPlanDefinition(""), null);
});

test("floor-plan route authenticates and authorizes before returning mappings", async () => {
  const source = await routeSource();

  assert.match(source, /getServerSession\(\)/);
  assert.match(source, /!session\?\.user\?\.accessToken/);
  assert.match(source, /api\/v1\/properties\/\$\{encodeURIComponent\(propertyId\)\}/);
  assert.match(source, /Property identity mismatch/);
  assert.match(source, /getFloorPlanDefinition\(propertyId\)/);
  assert.match(source, /private, no-store/);
});

test("floor plan is reachable from desktop and mobile navigation", async () => {
  const navigation = await readFile(
    new URL("../app/design-system/navigation-config.ts", import.meta.url),
    "utf8",
  );
  const mobileNavigation = await readFile(
    new URL("../app/components/ui/mobile-nav.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/dashboard/floor-plan/FloorPlanView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(navigation, /name: "Floor Plan"/);
  assert.match(navigation, /href: "\/dashboard\/floor-plan"/);
  assert.match(navigation, /labelKey: "nav\.floorPlan"/);
  assert.match(mobileNavigation, /pathname\.includes\("\/floor-plan"\)/);
  assert.match(page, /\/api\/floorplans\/\$\{encodeURIComponent\(selectedPropertyId\)\}/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /Swipe horizontally to inspect the full drawing/);
});

