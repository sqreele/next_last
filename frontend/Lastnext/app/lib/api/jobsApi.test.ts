import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobApiResponse } from "./job-contracts";
import { JobsApiService } from "./jobsApi";

const job: JobApiResponse = {
  id: 12,
  job_id: "JOB-12",
  user: {
    id: 7,
    username: "technician",
    first_name: "Test",
    last_name: "Technician",
    email: "technician@example.com",
    full_name: "Test Technician",
    display_name: "Test Technician",
  },
  user_username: "technician",
  user_first_name: "Test",
  user_last_name: "Technician",
  user_email: "technician@example.com",
  user_name: "Test Technician",
  technician_name: "Test Technician",
  created_by_name: "Test Technician",
  updated_by_name: "Test Technician",
  updated_by: "technician",
  description: "Inspect pump",
  status: "pending",
  priority: "medium",
  remarks: "",
  created_at: "2026-08-09T10:00:00Z",
  updated_at: "2026-08-09T10:00:00Z",
  completed_at: null,
  is_defective: false,
  rooms: [],
  topics: [],
  images: [],
  profile_image: null,
  image_urls: [],
  is_preventivemaintenance: false,
  area: null,
  comments_count: 0,
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JobsApiService contracts", () => {
  it("returns the backend paginated jobs response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        count: 1,
        next: null,
        previous: null,
        page_size: 24,
        current_page: 1,
        total_pages: 1,
        results: [job],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await new JobsApiService().getJobs("token");

    expect(response.count).toBe(1);
    expect(response.results).toEqual([job]);
  });

  it("serializes job mutations as JSON for the backend serializer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ...job, status: "completed" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new JobsApiService().updateJob("token", "12", {
      status: "completed",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/jobs/12/"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    );
  });
});
