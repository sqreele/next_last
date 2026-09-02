import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  INVENTORY_SEARCH_DEBOUNCE_MS,
  buildInventoryListParams,
  scheduleInventorySearch,
} from "../app/lib/inventory-search.mjs";

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

describe("Inventory search UX", () => {
  it("waits 300ms before applying one character", () => {
    const timers = createFakeTimers();
    const applied = [];
    scheduleInventorySearch("a", (value) => applied.push(value), timers);

    timers.advance(INVENTORY_SEARCH_DEBOUNCE_MS - 1);
    assert.deepEqual(applied, []);
    timers.advance(1);
    assert.deepEqual(applied, ["a"]);
  });

  it("applies only the final value after rapid typing", () => {
    const timers = createFakeTimers();
    const applied = [];
    let cancel = scheduleInventorySearch("a", (value) => applied.push(value), timers);
    cancel();
    cancel = scheduleInventorySearch("ab", (value) => applied.push(value), timers);
    cancel();
    scheduleInventorySearch("abc", (value) => applied.push(value), timers);

    timers.advance(INVENTORY_SEARCH_DEBOUNCE_MS);
    assert.deepEqual(applied, ["abc"]);
  });

  it("cancels a pending update when its owner unmounts", () => {
    const timers = createFakeTimers();
    const applied = [];
    const cancel = scheduleInventorySearch(
      "stale",
      (value) => applied.push(value),
      timers,
    );

    cancel();
    timers.advance(INVENTORY_SEARCH_DEBOUNCE_MS);
    assert.deepEqual(applied, []);
  });

  it("applies a cleared search only after the debounce", () => {
    const timers = createFakeTimers();
    const applied = ["pump"];
    scheduleInventorySearch("", (value) => applied.push(value), timers);

    timers.advance(INVENTORY_SEARCH_DEBOUNCE_MS - 1);
    assert.deepEqual(applied, ["pump"]);
    timers.advance(1);
    assert.deepEqual(applied, ["pump", ""]);
  });

  it("models one page-one request when search is applied from page four", () => {
    const timers = createFakeTimers();
    const requests = [];
    const filters = {
      propertyId: "PA",
      pageSize: 12,
      category: "parts",
      status: "available",
      room: "R4",
      lowStockOnly: false,
      job: "all",
      preventiveMaintenance: "PM2",
    };

    scheduleInventorySearch(
      "pump",
      (search) => {
        requests.push(
          buildInventoryListParams({ ...filters, page: 1, search }),
        );
      },
      timers,
    );

    timers.advance(INVENTORY_SEARCH_DEBOUNCE_MS);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].page, 1);
    assert.equal(requests[0].search, "pump");
  });

  it("preserves scope and filters while resetting search pagination", () => {
    assert.deepEqual(
      buildInventoryListParams({
        propertyId: "P00A12BC",
        page: 1,
        pageSize: 24,
        category: "parts",
        status: "low_stock",
        room: "R101",
        lowStockOnly: true,
        job: "J7",
        preventiveMaintenance: "PM9",
        search: "pump",
      }),
      {
        page: 1,
        page_size: 24,
        property_id: "P00A12BC",
        category: "parts",
        status: "low_stock",
        room_id: "R101",
        low_stock: "true",
        job_id: "J7",
        pm_id: "PM9",
        search: "pump",
      },
    );
  });

  it("clears search without changing its existing empty-search semantics", () => {
    const params = buildInventoryListParams({
      propertyId: "PA",
      page: 1,
      pageSize: 12,
      category: "all",
      status: "all",
      room: "all",
      lowStockOnly: false,
      job: "all",
      preventiveMaintenance: "all",
      search: "",
    });
    assert.equal("search" in params, false);
    assert.equal(params.property_id, "PA");
  });

  it("keeps input state immediate and introduces no navigation or reload", async () => {
    const source = await readFile(
      new URL("../app/dashboard/inventory/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /value=\{searchTerm\}/);
    assert.match(source, /onChange=\{\(e\) => setSearchTerm\(e\.target\.value\)\}/);
    assert.match(source, /setDebouncedSearchTerm\(nextSearchTerm\);\s*setPage\(1\)/);
    assert.doesNotMatch(source, /router\.(?:refresh|replace)\(|window\.location|location\.reload/);
  });
});
