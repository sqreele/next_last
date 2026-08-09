import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreventiveMaintenanceService } from "./PreventiveMaintenanceService";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const page = {
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 10,
  next: null,
  previous: null,
  results: [
    {
      pm_id: "PM-1",
      scheduled_date: "2026-08-10T00:00:00Z",
      frequency: "monthly" as const,
      machines: [],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PreventiveMaintenanceService list contract", () => {
  it("returns the backend page without flattening its metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page)));

    const response = await createPreventiveMaintenanceService().getAllPreventiveMaintenance();

    expect(response.data?.results).toHaveLength(1);
    expect(response.data?.count).toBe(1);
    expect(response.data?.current_page).toBe(1);
  });

  it("preserves an empty paginated result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...page, count: 0, results: [] })),
    );

    const response = await createPreventiveMaintenanceService().getAllPreventiveMaintenance();

    expect(response.data?.results).toEqual([]);
    expect(response.data?.count).toBe(0);
  });

  it("serializes the backend-supported scalar property filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page));
    vi.stubGlobal("fetch", fetchMock);

    await createPreventiveMaintenanceService().getAllPreventiveMaintenance({
      property_id: "property-a",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("property_id=property-a"),
      { credentials: "include" },
    );
  });

  it("does not accept a raw-array fallback for the paginated endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page.results)));

    await expect(
      createPreventiveMaintenanceService().getAllPreventiveMaintenance(),
    ).rejects.toThrow();
  });
});
