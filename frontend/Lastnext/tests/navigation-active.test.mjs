import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveNavigationItem,
  isNavigationItemActive,
} from "../app/lib/navigation-active.mjs";

const items = [
  { name: "Dashboard", href: "/dashboard", exact: true },
  { name: "Jobs", href: "/dashboard/jobs" },
  {
    name: "My Jobs",
    href: "/dashboard/my-jobs",
    match: ["/dashboard/myJobs"],
  },
  { name: "Create Job", href: "/dashboard/create-job" },
  { name: "Machines", href: "/dashboard/machines" },
  { name: "PM", href: "/dashboard/preventive-maintenance" },
  { name: "PM Schedule", href: "/dashboard/preventive-maintenance/schedule" },
  { name: "Inventory", href: "/dashboard/inventory" },
  { name: "Rooms", href: "/dashboard/rooms" },
  { name: "Areas", href: "/dashboard/areas" },
  { name: "Utility", href: "/dashboard/utility-consumption" },
  { name: "Reports", href: "/dashboard/jobs-report" },
  { name: "Settings", href: "/dashboard/profile" },
];

const cases = [
  ["/dashboard", "Dashboard"],
  ["/dashboard/jobs", "Jobs"],
  ["/dashboard/jobs?status=WT", "Jobs"],
  ["/dashboard/jobs/j123", "Jobs"],
  ["/dashboard/jobs/j123/edit", "Jobs"],
  ["/dashboard/my-jobs", "My Jobs"],
  ["/dashboard/myJobs", "My Jobs"],
  ["/dashboard/create-job", "Create Job"],
  ["/dashboard/machines", "Machines"],
  ["/dashboard/machines/M123", "Machines"],
  ["/dashboard/preventive-maintenance", "PM"],
  ["/dashboard/preventive-maintenance/pm123", "PM"],
  ["/dashboard/preventive-maintenance/create", "PM"],
  ["/dashboard/preventive-maintenance/plans", "PM"],
  ["/dashboard/preventive-maintenance/plans/P1/edit", "PM"],
  ["/dashboard/preventive-maintenance/schedule", "PM Schedule"],
  ["/dashboard/inventory?page=2", "Inventory"],
  ["/dashboard/rooms/R101", "Rooms"],
  ["/dashboard/areas", "Areas"],
  ["/dashboard/utility-consumption#usage", "Utility"],
  ["/dashboard/jobs-report", "Reports"],
  ["/dashboard/profile/edit/u1", "Settings"],
];

for (const [pathname, expected] of cases) {
  test(`${pathname} activates ${expected}`, () => {
    const active = getActiveNavigationItem(pathname, items);
    assert.equal(active?.name, expected);
    assert.deepEqual(
      items.filter((item) => isNavigationItemActive(pathname, item, items)).map((item) => item.name),
      [expected],
    );
  });
}

test("the dashboard root is inactive on unowned dashboard routes", () => {
  assert.equal(getActiveNavigationItem("/dashboard/search", items), undefined);
  assert.equal(isNavigationItemActive("/dashboard/search", items[0], items), false);
});

test("segment boundaries prevent near-prefix collisions", () => {
  assert.equal(getActiveNavigationItem("/dashboard/jobs-archive", items), undefined);
  assert.equal(getActiveNavigationItem("/dashboard/my-jobs-old", items), undefined);
});
