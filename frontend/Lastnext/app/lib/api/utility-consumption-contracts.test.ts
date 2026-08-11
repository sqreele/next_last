import { afterEach, describe, expect, it, vi } from "vitest";
import { toUtilityConsumptionRow } from "@/app/dashboard/utility-consumption/utils/data";
import { fetchAllUtilityConsumption } from "./utility-consumption-client";
import {
  isUtilityConsumptionListResponse,
  utilityListQueryString,
  type UtilityConsumptionCreatePayload,
  type UtilityConsumptionListItem,
  type UtilityConsumptionPatchPayload,
  type UtilityConsumptionUpdatePayload,
} from "./utility-consumption-contracts";

const item: UtilityConsumptionListItem = {
  id: 17,
  property_id: "P00000007",
  property_name: "Hotel Seven",
  month: 8,
  month_display: "August",
  year: 2026,
  totalkwh: 1234.56,
  onpeakkwh: null,
  offpeakkwh: 400.25,
  totalelectricity: 5100.75,
  electricity_cost_budget: null,
  water: null,
  nightsale: 9000,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-11T00:00:00Z",
};

function page(results: UtilityConsumptionListItem[], currentPage = 1, totalPages = 1) {
  return {
    count: results.length,
    total_pages: totalPages,
    current_page: currentPage,
    page_size: 100,
    next: currentPage < totalPages ? `http://backend/api?page=${currentPage + 1}` : null,
    previous: currentPage > 1 ? `http://backend/api?page=${currentPage - 1}` : null,
    results,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("utility consumption backend contract", () => {
  it("accepts the exact paginated list transport", () => {
    expect(isUtilityConsumptionListResponse(page([item]))).toBe(true);
  });

  it("rejects the former raw-array fallback", () => {
    expect(isUtilityConsumptionListResponse([item])).toBe(false);
  });

  it("preserves DecimalField output as JSON number", () => {
    expect(item.totalkwh).toBe(1234.56);
    expect(isUtilityConsumptionListResponse({
      ...page([item]),
      results: [{ ...item, totalkwh: "1234.56" }],
    })).toBe(false);
  });

  it("preserves nullable decimal fields", () => {
    expect(isUtilityConsumptionListResponse(page([item]))).toBe(true);
    expect(item.water).toBeNull();
  });

  it("keeps serialized dates as strings", () => {
    expect(item.created_at).toBe("2026-08-01T00:00:00Z");
    expect(isUtilityConsumptionListResponse({
      ...page([item]),
      results: [{ ...item, created_at: null }],
    })).toBe(false);
  });

  it("uses the property business ID as a string in list rows and filters", () => {
    expect(item.property_id).toBe("P00000007");
    expect(utilityListQueryString({ property_id: item.property_id })).toBe("property_id=P00000007");
  });

  it("maps only at the chart boundary and converts null deterministically", () => {
    expect(toUtilityConsumptionRow(item)).toEqual(expect.objectContaining({
      month: "August",
      totalkwh: 1234.56,
      onpeakkwh: 0,
      water: 0,
    }));
  });

  it("serializes only backend-supported query fields", () => {
    expect(utilityListQueryString({ year: 2026, month: 8, ordering: "-year", page: 2, page_size: 100 }))
      .toBe("year=2026&month=8&ordering=-year&page=2&page_size=100");
  });

  it("models create, PUT, and PATCH payloads separately from read metadata", () => {
    const create: UtilityConsumptionCreatePayload = { property: 7, month: 8, year: 2026, water: null };
    const update: UtilityConsumptionUpdatePayload = { ...create, water: 12.5 };
    const patch: UtilityConsumptionPatchPayload = { water: null };
    expect({ create, update, patch }).toEqual({
      create: { property: 7, month: 8, year: 2026, water: null },
      update: { property: 7, month: 8, year: 2026, water: 12.5 },
      patch: { water: null },
    });
  });

  it("loads every backend page instead of fabricating an array response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page([item], 1, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => page([{ ...item, id: 18 }], 2, 2) });
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchAllUtilityConsumption({ property_id: "P00000007" });

    expect(results.map((row) => row.id)).toEqual([17, 18]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining("page=1"), { signal: undefined });
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("page=2"), { signal: undefined });
  });

  it("rejects an invalid API page before consumers receive it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [item] }) }));
    await expect(fetchAllUtilityConsumption({ property_id: "P00000007" }))
      .rejects.toThrow("Invalid utility consumption response contract.");
  });
});
