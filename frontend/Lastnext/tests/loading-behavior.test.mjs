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

test("bouncing dots loader is accessible, responsive, and motion-safe", async () => {
  const loader = await source("app/components/ui/BouncingDotsLoader.tsx");
  assert.equal((loader.match(/data-loader-dot(?:\s|>)/g) ?? []).length, 3);
  assert.match(loader, /role="status"/);
  assert.match(loader, /aria-live="polite"/);
  assert.match(loader, /label \? "ml-2" : "sr-only"/);
  assert.match(loader, /size\?: "sm" \| "md" \| "lg"/);
  assert.match(loader, /fullScreen && "pcms-page-loading-frame w-full"/);
  assert.match(loader, /motion-safe:animate-bounce/);
  assert.match(loader, /motion-reduce:animate-none/);
  assert.match(loader, /motion-reduce:opacity-/);
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

test("route transitions stay visible and cover non-link navigation", async () => {
  const loader = await source("app/components/ui/loading/RouteTransitionLoader.tsx");
  assert.match(loader, /useMinLoaderTime\(setLoaderVisible\)/);
  assert.match(loader, /clearLoadingAfterMinTime\(token\)/);
  assert.match(loader, /window\.addEventListener\('popstate', onPopState\)/);
  assert.match(loader, /window\.history\.pushState = function/);
  assert.match(loader, /window\.history\.replaceState = function/);
  assert.match(loader, /if \(!restart && activeRef\.current\) return/);
  assert.match(loader, /MAX_ROUTE_LOADING_MS/);
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

test("dashboard page loaders center within the available content area", async () => {
  const pageLoader = await source("app/components/ui/loading/PageLoader.tsx");
  const pageLoadingFrame = await source("app/components/ui/loading/PageLoadingFrame.tsx");
  const dashboardLayout = await source("app/dashboard/DashboardLayoutClient.tsx");
  const pullToRefresh = await source("app/components/ui/pull-to-refresh.tsx");

  assert.match(pageLoader, /<PageLoadingFrame/);
  assert.doesNotMatch(pageLoader, /100vh/);
  assert.match(pageLoadingFrame, /pcms-page-loading-frame flex w-full items-center justify-center/);
  assert.match(dashboardLayout, /h-screen-safe min-h-screen-safe/);
  assert.match(dashboardLayout, /min-h-0 flex-1 overflow-auto/);
  assert.match(dashboardLayout, /<PageTransition className="h-full/);
  assert.match(pullToRefresh, /className="min-h-full"/);
});

test("idle pull-to-refresh does not trap viewport-fixed descendants", async () => {
  const pullToRefresh = await source("app/components/ui/pull-to-refresh.tsx");

  assert.match(pullToRefresh, /pullDistance > 0/);
  assert.match(pullToRefresh, /: undefined/);
  assert.doesNotMatch(
    pullToRefresh,
    /transform:\s*`translateY\(\$\{pullDistance\}px\)`/,
  );
});

test("all custom route skeletons use the shared centered loading frame", async () => {
  const customFallbacks = [
    "app/dashboard/loading.tsx",
    "app/dashboard/my-jobs/loading.tsx",
    "app/dashboard/rooms/by-topics/loading.tsx",
  ];

  for (const path of customFallbacks) {
    assert.match(await source(path), /<PageLoadingFrame/, path);
  }

  const skeletons = await source("app/components/ui/loading/Skeleton.tsx");
  assert.match(skeletons, /export function DetailPageSkeleton[\s\S]*?<PageLoadingFrame/);
  assert.match(skeletons, /export function SettingsPageSkeleton[\s\S]*?<PageLoadingFrame/);
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
  assert.match(inventory, /t\("common\.loading"\)/);
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
  assert.match(modal, /isPending \? t\("pm\.deleting"\)/);
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
  const layout = await source("app/dashboard/DashboardLayoutClient.tsx");
  assert.match(search, /loadedContext\?\.propertyId === selectedProperty/);
  assert.match(search, /loadedContext\?\.query !== query/);
  assert.match(search, /requestId !== searchRequestIdRef\.current/);
  assert.match(search, /const controller = new AbortController\(\)/);
  assert.match(search, /signal: controller\.signal/);
  assert.match(search, /SEARCH_TIMEOUT_MS/);
  assert.match(search, /requestController\?\.abort\(\)/);
  assert.match(search, /<BouncingDotsLoader/);
  assert.match(search, /Updating search results…/);
  assert.match(search, /asChild\s+variant="outline"/);
  assert.match(search, /border-primary\/40 bg-background/);
  assert.match(layout, /type="submit"[\s\S]*?disabled=\{isPending\}/);
  assert.doesNotMatch(layout, /isLoading=\{isPending\}/);
  assert.match(layout, /aria-label=\{isPending \? "Searching" : "Search"\}/);
});

test("search fills the dashboard content area in every UI state", async () => {
  const page = await source("app/dashboard/search/page.tsx");
  const search = await source("app/dashboard/search/SearchContent.tsx");

  assert.match(page, /className="w-full max-w-none px-3 py-6 sm:px-6"/);
  assert.doesNotMatch(page, /max-w-4xl/);
  assert.match(search, /"min-h-full w-full max-w-none px-3 py-4 sm:px-6 sm:py-6"/);
  assert.match(search, /className=\{SEARCH_FEEDBACK_CLASS\}/);
  assert.doesNotMatch(search, /max-w-4xl/);
  assert.match(search, /const SEARCH_RESULTS_LIST_CLASS = "space-y-3"/);
  assert.match(search, /className=\{SEARCH_RESULTS_LIST_CLASS\} role="list"/);
  assert.match(search, /className=\{SEARCH_RESULT_ROW_CLASS\} role="listitem"/);
  assert.doesNotMatch(search, /xl:grid-cols-4/);
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
  const billing = await source("app/dashboard/settings/billing/BillingSettingsClient.tsx");
  assert.match(users, /submitting \? "Sending…"/);
  assert.match(users, /actionId === invitation\.id \? "Working…"/);
  assert.match(billing, /loading && !hasLoaded/);
  assert.match(billing, /loading \? "Refreshing…"/);
  assert.match(billing, /"Opening…"/);
});
