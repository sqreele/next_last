import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/session.server", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/app/lib/config", () => ({
  API_CONFIG: { baseUrl: "https://backend.example" },
}));

beforeEach(() => {
  mocks.getServerSession.mockReset().mockResolvedValue({
    user: { accessToken: "access-token" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ id: 81 }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  )));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("job comments proxy request identity", () => {
  it("forwards the client comment request ID unchanged", async () => {
    const body = {
      comment: "Proxy must preserve this identity",
      client_comment_request_id: "49b9c87a-9fd9-4bfb-b038-0eb7782c78e1",
    };
    const request = new Request("http://localhost/api/jobs/JOB-7/comments/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(
      request as never,
      { params: Promise.resolve({ jobId: "JOB-7" }) },
    );

    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example/api/v1/jobs/JOB-7/comments/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });
});
