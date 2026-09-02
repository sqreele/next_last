import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMinLoaderController } from "../app/lib/hooks/min-loader-controller.mjs";

const root = new URL("../", import.meta.url);

const source = (path) => readFile(new URL(path, root), "utf8");

function fakeClock() {
  let time = 0;
  let nextTimer = 1;
  const timers = new Map();

  const runDueTimers = () => {
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= time)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) return;
      timers.delete(due[0]);
      due[1].callback();
    }
  };

  return {
    now: () => time,
    schedule(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    cancel: (id) => timers.delete(id),
    advance(milliseconds) {
      time += milliseconds;
      runDueTimers();
    },
    pending: () => timers.size,
  };
}

function loaderHarness() {
  const clock = fakeClock();
  let hides = 0;
  const controller = createMinLoaderController({
    hide: () => { hides += 1; },
    minDuration: 400,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { clock, controller, hides: () => hides };
}

test("shared skeletons expose busy state and honor reduced motion", async () => {
  const skeletons = await source("app/components/ui/loading/Skeleton.tsx");
  assert.match(skeletons, /motion-reduce:animate-none/);
  assert.match(skeletons, /aria-busy="true"/);
  assert.match(skeletons, /SettingsPageSkeleton/);
});

test("background overlay is informative without blocking settled content", async () => {
  const overlay = await source("app/components/ui/loading/LoadingOverlay.tsx");
  assert.match(overlay, /pointer-events-none/);
  assert.match(overlay, /aria-live="polite"/);
  assert.match(overlay, /aria-atomic="true"/);
});

test("the React hook delegates to the guarded controller", async () => {
  const hook = await source("app/lib/hooks/useMinLoaderTime.ts");
  assert.match(hook, /createMinLoaderController/);
  assert.match(hook, /controller\.mount\(\)/);
  assert.match(hook, /controller\.dispose\(\)/);
});

test("a stale completion cannot hide a newer active request", () => {
  const { clock, controller, hides } = loaderHarness();
  const requestA = controller.start();
  clock.advance(100);
  const requestB = controller.start();
  clock.advance(50);
  controller.finish(requestA);
  clock.advance(350);
  assert.equal(hides(), 0);

  controller.finish(requestB);
  assert.equal(hides(), 1);
});

test("a stale timer cannot hide a newer request", () => {
  const { clock, controller, hides } = loaderHarness();
  const requestA = controller.start();
  clock.advance(100);
  controller.finish(requestA);
  assert.equal(clock.pending(), 1);

  clock.advance(100);
  const requestB = controller.start();
  assert.equal(clock.pending(), 0);
  clock.advance(200);
  assert.equal(hides(), 0);

  controller.finish(requestB);
  clock.advance(199);
  assert.equal(hides(), 0);
  clock.advance(1);
  assert.equal(hides(), 1);
});

test("the current request observes the minimum duration", () => {
  const { clock, controller, hides } = loaderHarness();
  const request = controller.start();
  clock.advance(125);
  controller.finish(request);
  controller.finish(request);
  clock.advance(274);
  assert.equal(hides(), 0);
  clock.advance(1);
  assert.equal(hides(), 1);
});

test("newer completion wins and a later stale completion is inert", () => {
  const { clock, controller, hides } = loaderHarness();
  const requestA = controller.start();
  clock.advance(50);
  const requestB = controller.start();
  clock.advance(50);
  controller.finish(requestB);
  assert.equal(hides(), 0);
  clock.advance(50);
  controller.finish(requestA);
  clock.advance(299);
  assert.equal(hides(), 0);
  clock.advance(1);
  assert.equal(hides(), 1);
});

test("cleanup cancels timers and strict-mode remount keeps tokens safe", () => {
  const { clock, controller, hides } = loaderHarness();
  const staleRequest = controller.start();
  clock.advance(100);
  controller.finish(staleRequest);
  assert.equal(clock.pending(), 1);
  controller.dispose();
  assert.equal(clock.pending(), 0);
  clock.advance(500);
  assert.equal(hides(), 0);

  controller.mount();
  const currentRequest = controller.start();
  controller.finish(staleRequest);
  clock.advance(400);
  assert.equal(hides(), 0);
  controller.finish(currentRequest);
  assert.equal(hides(), 1);
});

test("route fallbacks describe their destination instead of one generic wait", async () => {
  const paths = [
    "areas",
    "create-job",
    "inventory",
    "jobs-report",
    "machines",
    "maintenance-tasks",
    "preventive-maintenance",
    "profile",
    "search",
    "utility-consumption",
  ];
  for (const path of paths) {
    const loading = await source(`app/dashboard/${path}/loading.tsx`);
    assert.match(loading, /<PageLoader label=/, path);
  }
});

test("detail pages use stable detail skeletons on first load", async () => {
  const machine = await source("app/dashboard/machines/[machine_id]/page.tsx");
  const task = await source("app/dashboard/maintenance-tasks/[id]/page.tsx");
  const job = await source("app/dashboard/jobs/[jobId]/edit/page.tsx");
  assert.match(machine, /return <DetailPageSkeleton/);
  assert.match(task, /return <DetailPageSkeleton/);
  assert.match(task, /requestId !== taskRequestRef\.current/);
  assert.match(job, /signal: controller\.signal/);
  assert.match(job, /requestId !== requestIdRef\.current/);
});

test("jobs keep the filter shell and settled cards mounted while refreshing", async () => {
  const jobs = await source("app/dashboard/jobs/JobsListWithStatus.tsx");
  assert.match(jobs, /loading && !scopedResponse/);
  assert.match(jobs, /<LoadingOverlay show=\{loading\}/);
  assert.match(jobs, /current\?\.property_id === requestPropertyId/);
});

test("jobs pagination remains visible and is disabled during page requests", async () => {
  const jobs = await source("app/dashboard/jobs/JobsListWithStatus.tsx");
  assert.match(jobs, /scopedResponse\.count > PAGE_SIZE/);
  assert.match(jobs, /disabled=\{loading \|\| !scopedResponse\.previous\}/);
  assert.match(jobs, /disabled=\{loading \|\| !scopedResponse\.next\}/);
});

test("inventory preserves settled content and pagination during same-scope updates", async () => {
  const inventory = await source("app/dashboard/inventory/page.tsx");
  assert.match(inventory, /loading && !hasLoadedInventory/);
  assert.match(inventory, /if \(!hasLoadedInventory\) \{/);
  assert.match(inventory, /Updating inventory…/);
  assert.match(inventory, /disabled=\{loading \|\| page >= totalPages\}/);
});

test("maintenance task paging rejects stale responses and keeps its shell", async () => {
  const tasks = await source("app/dashboard/maintenance-tasks/page.tsx");
  assert.match(tasks, /const requestId = \+\+requestIdRef\.current/);
  assert.match(tasks, /requestId !== requestIdRef\.current/);
  assert.match(tasks, /loading && !hasLoadedTasksRef\.current/);
  assert.match(tasks, /Updating maintenance tasks…/);
});

test("preventive maintenance refreshes in place and rejects stale machine scope", async () => {
  const page = await source("app/dashboard/preventive-maintenance/page.tsx");
  const actions = await source("app/lib/hooks/usePreventiveMaintenanceActions.ts");
  assert.match(page, /<LoadingOverlay/);
  assert.match(actions, /useMinLoaderTime\(setLoading\)/);
  assert.match(actions, /setLoading\(true\)/);
  assert.match(actions, /machineRequestRef/);
  assert.match(actions, /selectedPropertyId === targetPropertyId/);
});

test("preventive maintenance mutations use targeted pending controls", async () => {
  const page = await source("app/dashboard/preventive-maintenance/page.tsx");
  const modal = await source("app/components/preventive/list/DeleteModal.tsx");
  const bulk = await source("app/components/preventive/list/BulkActions.tsx");
  assert.match(page, /isPending=\{mutationPending\}/);
  assert.match(modal, /isPending \? 'Deleting…'/);
  assert.match(bulk, /disabled=\{isPending\}/);
});

test("areas keep search controls mounted and hide the previous property immediately", async () => {
  const areas = await source("app/dashboard/areas/AreasClient.tsx");
  assert.match(areas, /setTimeout\(\(\) => \{\s*setDebouncedSearch\(search\);\s*\}, 300\)/);
  assert.match(areas, /loadedPropertyId === selectedPropertyId \? areas : \[\]/);
  assert.match(areas, /loading && scopedAreas\.length === 0/);
  assert.match(areas, /Updating areas…/);
});

test("search keeps the last settled query but never crosses a property boundary", async () => {
  const search = await source("app/dashboard/search/SearchContent.tsx");
  assert.match(search, /loadedContext\?\.propertyId === selectedProperty/);
  assert.match(search, /loadedContext\?\.query !== query/);
  assert.match(search, /requestId !== searchRequestIdRef\.current/);
  assert.match(search, /Updating search results…/);
});

test("tenant invitation loading is scope-bound and does not replace settled rows", async () => {
  const users = await source("app/dashboard/settings/users/page.tsx");
  assert.match(users, /loadedTenantId === tenantId \? invitations : \[\]/);
  assert.match(users, /invitationRequestRef/);
  assert.match(users, /tenantIdRef\.current !== requestTenantId/);
  assert.match(users, /SkeletonTable rows=\{5\} columns=\{6\}/);
  assert.match(users, /Updating invitations…/);
});

test("settings actions expose local progress without replacing loaded pages", async () => {
  const users = await source("app/dashboard/settings/users/page.tsx");
  const billing = await source("app/dashboard/settings/billing/page.tsx");
  assert.match(users, /submitting \? "Sending…"/);
  assert.match(users, /actionId === invitation\.id \? "Working…"/);
  assert.match(billing, /loading && !hasLoaded/);
  assert.match(billing, /loading \? "Refreshing…"/);
  assert.match(billing, /"Opening…"/);
});
