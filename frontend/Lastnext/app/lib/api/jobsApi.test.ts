import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { JobsApiService } from "./jobsApi";

const job: Job = {
  id: 12,
  job_id: "JOB-12",
  description: "Inspect pump",
  status: "pending",
  priority: "medium",
  created_at: "2026-08-09T10:00:00Z",
  updated_at: "2026-08-09T10:00:00Z",
  completed_at: null,
  user: 7,
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
      jsonResponse({ count: 1, next: null, previous: null, results: [job] }),
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
