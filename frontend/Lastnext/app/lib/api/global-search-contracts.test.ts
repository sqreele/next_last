import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGlobalSearch } from "./global-search-client";
import {
  globalSearchQueryString,
  groupSearchResults,
  isGlobalSearchResponse,
  toJobSearchResult,
  toPropertySearchResult,
  toRoomSearchResult,
  type GlobalSearchResponse,
} from "./global-search-contracts";

const propertyRef = { id: 7, property_id: "P00000007", name: "Hotel Seven" };
const job = toJobSearchResult({
  job_id: "J000000000000007",
  description: "Air conditioner repair",
  status: "waiting_sparepart",
  priority: "high",
  created_at: "2026-08-11T00:00:00Z",
});
const property = toPropertySearchResult({
  property_id: "P00000007",
  name: "Hotel Seven",
  description: null,
});
const room = toRoomSearchResult({
  room_id: 701,
  name: "701",
  room_type: "Suite",
  is_active: true,
  created_at: "2026-08-01T00:00:00Z",
  properties: [7],
}, [propertyRef]);

afterEach(() => vi.unstubAllGlobals());

describe("global search contracts", () => {
  it("serializes only q and the property business ID", () => {
    expect(globalSearchQueryString({ q: "  air con  ", property_id: "P00000007" }))
      .toBe("q=air+con&property_id=P00000007");
  });

  it("creates the compact Job result with Job business identity", () => {
    expect(job).toEqual(expect.objectContaining({ type: "job", id: "J000000000000007" }));
  });

  it("preserves the current non-default Job status", () => {
    expect(job).toEqual(expect.objectContaining({ status: "waiting_sparepart" }));
  });

  it("creates the compact Property result with nullable description", () => {
    expect(property).toEqual(expect.objectContaining({ type: "property", id: "P00000007", description: null }));
  });

  it("creates the compact Room result with numeric room identity and property context", () => {
    expect(room).toEqual(expect.objectContaining({ type: "room", id: 701, property: propertyRef }));
  });

  it("maps canonical navigation without guessing generic IDs", () => {
    expect(job?.url).toBe("/dashboard/jobs/J000000000000007");
    expect(property?.url).toBe("/dashboard/properties?property_id=P00000007");
    expect(room?.url).toBe("/dashboard/rooms/701");
  });

  it("accepts an exact cross-domain response", () => {
    const response = { results: [job, property, room], total: 3 };
    expect(isGlobalSearchResponse(response)).toBe(true);
  });

  it("accepts the canonical empty response", () => {
    expect(isGlobalSearchResponse({ results: [], total: 0 })).toBe(true);
  });

  it("rejects unknown result types without fabricating navigation", () => {
    expect(isGlobalSearchResponse({ results: [{ type: "user", id: 41, url: "/users/41" }], total: 1 })).toBe(false);
  });

  it("groups by discriminant and preserves backend order within each domain", () => {
    if (!job || !property || !room) throw new Error("Invalid test fixture");
    const secondJob = { ...job, id: "J000000000000008" };
    const grouped = groupSearchResults([job, property, secondJob, room]);
    expect(grouped.jobs.map((result) => result.id)).toEqual(["J000000000000007", "J000000000000008"]);
    expect(grouped.properties).toEqual([property]);
    expect(grouped.rooms).toEqual([room]);
  });

  it("rejects a total that disagrees with results", () => {
    expect(isGlobalSearchResponse({ results: [job], total: 2 })).toBe(false);
  });

  it("passes AbortSignal through for stale-request cancellation", async () => {
    const payload: GlobalSearchResponse = { results: [], total: 0 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await fetchGlobalSearch({ q: "pump", property_id: "P00000007" }, controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q=pump"), { signal: controller.signal });
  });

  it("rejects invalid transport before the consumer receives it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobs: [] }) }));
    await expect(fetchGlobalSearch({ q: "pump", property_id: "P00000007" }))
      .rejects.toThrow("Invalid global search response contract.");
  });
});
