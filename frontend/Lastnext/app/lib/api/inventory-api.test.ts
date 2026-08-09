import { afterEach, describe, expect, it, vi } from "vitest";
import apiClient from "../api-client";
import { inventoryApi } from "./inventory-api";

const inventoryItem = {
  id: 1,
  item_id: "INV-1",
  name: "Filter",
  quantity: 8,
  min_quantity: 2,
  unit: "pcs",
  status: "available",
};

const page = {
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 10,
  next: null,
  previous: null,
  results: [inventoryItem],
};

afterEach(() => vi.restoreAllMocks());

describe("inventoryApi backend contracts", () => {
  it("returns the canonical paginated list and serializes supported filters", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({ data: page });

    const result = await inventoryApi.list({
      property_id: "PROP-1",
      low_stock: true,
      page: 2,
      page_size: 12,
    });

    expect(result).toBe(page);
    expect(getMock).toHaveBeenCalledWith("/api/v1/inventory/", {
      params: { property_id: "PROP-1", low_stock: true, page: 2, page_size: 12 },
    });
  });

  it("rejects the stale raw-array list transport", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: page.results });
    await expect(inventoryApi.list({})).rejects.toThrow("Invalid inventory paginated response");
  });

  it("posts a numeric restock payload and returns detail", async () => {
    const postMock = vi.spyOn(apiClient, "post").mockResolvedValue({ data: inventoryItem });
    const result = await inventoryApi.restock("INV-1", { quantity: 5 });

    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/inventory/INV-1/restock/",
      { quantity: 5 },
    );
    expect(result.quantity).toBe(8);
  });

  it("keeps use relations mutually exclusive at the payload boundary", async () => {
    const postMock = vi.spyOn(apiClient, "post").mockResolvedValue({ data: inventoryItem });
    await inventoryApi.use("INV-1", { quantity: 2, job_id: "JOB-1" });

    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/inventory/INV-1/use/",
      { quantity: 2, job_id: "JOB-1" },
    );
  });

  it("preserves DRF decimal strings and nulls in usage history", async () => {
    const usagePage = {
      ...page,
      results: [{ quantity: 2, unit_cost: "125.50", total_cost: null }],
    };
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: usagePage });

    const result = await inventoryApi.usage("INV-1");

    expect(result.results[0].unit_cost).toBe("125.50");
    expect(result.results[0].total_cost).toBeNull();
  });
});
