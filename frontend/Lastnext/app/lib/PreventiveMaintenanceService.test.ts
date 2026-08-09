import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreventiveMaintenanceService } from "./PreventiveMaintenanceService";
import apiClient from "./api-client";

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
  vi.restoreAllMocks();
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

describe("PreventiveMaintenanceService detail and write contracts", () => {
  it("returns the detail endpoint representation directly", async () => {
    const detail = { pm_id: "PM-DETAIL", property_id: null, machines: [] };
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: detail });

    const response = await createPreventiveMaintenanceService().getPreventiveMaintenanceById("PM-DETAIL");

    expect(response.data).toBe(detail);
  });

  it("creates with only writable backend fields and repeated relation IDs", async () => {
    const postMock = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { pm_id: "PM-CREATED" } });

    await createPreventiveMaintenanceService().createPreventiveMaintenance({
      scheduled_date: "2026-08-10T09:00:00Z",
      frequency: "monthly",
      machine_ids: ["M-1", "M-2"],
      topic_ids: [3, 4],
      assigned_to: null,
    });

    const body = postMock.mock.calls[0][1] as FormData;
    expect(body.getAll("machine_ids")).toEqual(["M-1", "M-2"]);
    expect(body.getAll("topic_ids")).toEqual(["3", "4"]);
    expect(body.get("scheduled_date")).toBe("2026-08-10T09:00:00Z");
    expect(body.has("property_id")).toBe(false);
    expect(body.has("status")).toBe(false);
    expect(body.has("next_due_date")).toBe(false);
    expect(body.has("assigned_to")).toBe(false);
  });

  it("uses PUT with the complete canonical update payload", async () => {
    const putMock = vi.spyOn(apiClient, "put").mockResolvedValue({ data: { pm_id: "PM-UPDATED" } });

    await createPreventiveMaintenanceService().updatePreventiveMaintenance("PM-UPDATED", {
      scheduled_date: "2026-08-11T09:00:00Z",
      frequency: "custom",
      custom_days: 14,
      machine_ids: ["M-1"],
      assigned_to: null,
    });

    const body = putMock.mock.calls[0][1] as FormData;
    expect(putMock).toHaveBeenCalledWith(
      "/api/v1/preventive-maintenance/PM-UPDATED/",
      body,
      expect.any(Object),
    );
    expect(body.get("frequency")).toBe("custom");
    expect(body.get("custom_days")).toBe("14");
    expect(body.get("assigned_to")).toBe("");
  });

  it("posts the active completion fields and returns completion metadata", async () => {
    const completion = { pm_id: "PM-DONE", inventory_usage: [], next_schedule_pm_id: "PM-NEXT" };
    const postMock = vi.spyOn(apiClient, "post").mockResolvedValue({ data: completion });

    const response = await createPreventiveMaintenanceService().completePreventiveMaintenance("PM-DONE", {
      completed_date: "2026-08-10T10:00:00Z",
      completion_notes: "Completed safely",
    });

    const body = postMock.mock.calls[0][1] as FormData;
    expect(body.get("completed_date")).toBe("2026-08-10T10:00:00Z");
    expect(body.get("completion_notes")).toBe("Completed safely");
    expect(response.data?.next_schedule_pm_id).toBe("PM-NEXT");
  });
});
