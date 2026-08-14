import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJob, fetchWithToken, ServerApiError } from "./data.server";

vi.mock("./csrf", () => ({
  getCsrfHeaders: vi.fn().mockResolvedValue({}),
}));

describe("Job delete HTTP contract", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("accepts an empty 204 and sends the canonical DELETE without a body", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteJob("JOB-418", "access-token-a")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/v1/jobs/JOB-418/");
    expect(request).toEqual(expect.objectContaining({
      method: "DELETE",
      credentials: "include",
      headers: expect.objectContaining({
        Authorization: "Bearer access-token-a",
        "Content-Type": "application/json",
      }),
    }));
    expect(request?.body).toBeUndefined();
  });

  it("preserves JSON response parsing for successful requests with bodies", async () => {
    const payload = { job_id: "JOB-418", status: "completed" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(
      fetchWithToken<typeof payload>("/api/v1/jobs/JOB-418/", "access-token-a"),
    ).resolves.toEqual(payload);
  });

  it("preserves structured non-success errors instead of treating them as deletion", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ detail: "You do not have access to this property." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ));

    const deletion = deleteJob("JOB-418", "access-token-a");
    await expect(deletion).rejects.toBeInstanceOf(ServerApiError);
    await expect(deletion).rejects.toMatchObject({
      name: "ServerApiError",
      status: 403,
      message: "You do not have access to this property.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
