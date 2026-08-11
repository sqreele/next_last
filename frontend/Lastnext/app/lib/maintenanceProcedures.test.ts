import { afterEach, describe, expect, it, vi } from "vitest";
import apiClient from "./api-client";
import {
  fetchAllMaintenanceProcedures,
  fetchMaintenanceProcedure,
  fetchMaintenanceProcedures,
} from "./maintenanceProcedures";

const procedure = {
  id: 7,
  name: "Inspect pump",
  group_id: "PUMP",
  category: "Pump",
  frequency: "monthly" as const,
  estimated_duration: "30 mins",
  responsible_department: "Engineering",
  difficulty_level: "intermediate" as const,
  schedule_count: 2,
  machine_ids: ["M-1"],
  machines: [
    { machine_id: "M-1", name: "Main pump", group_id: "PUMP", property_id: 3 },
  ],
  created_at: "2026-08-11T00:00:00Z",
};

const page = {
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 10,
  next: null,
  previous: null,
  results: [procedure],
};

afterEach(() => vi.restoreAllMocks());

describe("maintenance procedure backend contracts", () => {
  it("returns the canonical paginated list and supported query", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({ data: page });

    const result = await fetchMaintenanceProcedures({
      page: 2,
      page_size: 25,
      difficulty_level: "intermediate",
      search: "pump",
      ordering: "name",
    });

    expect(result).toBe(page);
    expect(getMock).toHaveBeenCalledWith("/api/v1/maintenance-procedures/", {
      params: {
        page: 2,
        page_size: 25,
        difficulty_level: "intermediate",
        search: "pump",
        ordering: "name",
      },
    });
  });

  it("rejects the stale raw-array list transport", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: page.results });

    await expect(fetchMaintenanceProcedures()).rejects.toThrow(
      "Invalid maintenance procedure paginated response",
    );
  });

  it("fetches all pages for the PM option boundary", async () => {
    const getMock = vi
      .spyOn(apiClient, "get")
      .mockResolvedValueOnce({
        data: { ...page, count: 2, total_pages: 2, next: "?page=2" },
      })
      .mockResolvedValueOnce({
        data: {
          ...page,
          count: 2,
          current_page: 2,
          total_pages: 2,
          previous: "?page=1",
          results: [{ ...procedure, id: 8, name: "Inspect fan" }],
        },
      });

    const result = await fetchAllMaintenanceProcedures({ pageSize: 100 });

    expect(result.map((item) => item.id)).toEqual([7, 8]);
    expect(getMock).toHaveBeenNthCalledWith(2, "/api/v1/maintenance-procedures/", {
      params: { page: 2, page_size: 100 },
    });
  });

  it("returns the detail serializer representation directly", async () => {
    const detail = {
      ...procedure,
      description: "Inspect seals and pressure.",
      required_tools: null,
      safety_notes: null,
      updated_at: "2026-08-11T01:00:00Z",
    };
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({ data: detail });

    const result = await fetchMaintenanceProcedure(7);

    expect(result).toBe(detail);
    expect(getMock).toHaveBeenCalledWith("/api/v1/maintenance-procedures/7/");
  });
});
