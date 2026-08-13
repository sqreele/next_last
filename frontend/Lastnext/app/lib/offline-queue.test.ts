import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "pcms-offline-queue-v1";

async function freshQueue() {
  vi.resetModules();
  return import("./offline-queue");
}

function queuedInput(ownerUserId: number, suffix = "1") {
  return {
    owner_user_id: ownerUserId,
    kind: "job-comment-create" as const,
    label: `Comment ${suffix}`,
    endpoint: `/api/v1/jobs/JOB-${suffix}/comments/`,
    method: "POST" as const,
    body: {
      comment: `note ${suffix}`,
      property_id: "PROPERTY-A",
      client_comment_request_id: `request-${suffix}`,
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("offline queue session ownership", () => {
  it("blocks a User A mutation from replaying under User B", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));
    const perform = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await queue.replayQueue(84, perform);

    expect(perform).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, remaining: 1 });
  });

  it("allows replay after a token refresh when backend user identity is unchanged", async () => {
    const queue = await freshQueue();
    const item = queue.enqueueRequest(queuedInput(41));
    const perform = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(queue.replayQueue(41, perform)).resolves.toEqual({ delivered: 1, remaining: 0 });
    expect(perform).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, owner_user_id: 41 }));
  });

  it("does not replay when there is no authenticated backend user", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));
    const perform = vi.fn();

    await queue.replayQueue(null, perform);

    expect(perform).not.toHaveBeenCalled();
    expect(queue.getQueue()).toHaveLength(1);
  });

  it("fails closed for a persisted legacy item without ownership metadata", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{
      id: "legacy-1",
      kind: "job-comment-create",
      label: "Legacy comment",
      endpoint: "/api/v1/jobs/JOB-1/comments/",
      method: "POST",
      body: { comment: "legacy" },
      createdAt: 1,
      retries: 0,
    }]));
    const queue = await freshQueue();
    const perform = vi.fn();

    await queue.replayQueue(41, perform);

    expect(perform).not.toHaveBeenCalled();
    expect(queue.getQueue()).toHaveLength(1);
  });

  it("preserves owner metadata and payload through localStorage restoration", async () => {
    let queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));

    queue = await freshQueue();

    expect(queue.getQueue()).toEqual([
      expect.objectContaining({
        owner_user_id: 41,
        endpoint: "/api/v1/jobs/JOB-1/comments/",
        body: {
          comment: "note 1",
          property_id: "PROPERTY-A",
          client_comment_request_id: "request-1",
        },
      }),
    ]);
  });

  it("replays only the current owner's items without exposing foreign details", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41, "A1"));
    queue.enqueueRequest(queuedInput(84, "B1"));
    queue.enqueueRequest(queuedInput(41, "A2"));
    const perform = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await queue.replayQueue(41, perform);

    expect(perform.mock.calls.map(([item]) => item.label)).toEqual(["Comment A1", "Comment A2"]);
    expect(result).toEqual({ delivered: 2, remaining: 1 });
    expect(queue.getQueueForOwner(41)).toEqual([]);
    expect(queue.getQueueForOwner(84).map((item) => item.label)).toEqual(["Comment B1"]);
  });

  it("never persists credentials with a queue entry", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));

    const persisted = window.localStorage.getItem(STORAGE_KEY) ?? "";
    expect(persisted).not.toMatch(/accessToken|refreshToken|authorization|bearer/i);
  });

  it("removes only successful same-owner items during partial replay", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41, "1"));
    queue.enqueueRequest(queuedInput(41, "2"));
    const perform = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await queue.replayQueue(41, perform);

    expect(result).toEqual({ delivered: 1, remaining: 1 });
    expect(queue.getQueue()).toEqual([
      expect.objectContaining({ label: "Comment 2", retries: 1 }),
    ]);
  });

  it("retains an item when replay authentication has expired", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));
    const perform = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    const result = await queue.replayQueue(41, perform);

    expect(result).toEqual({ delivered: 0, remaining: 1 });
    expect(queue.getQueue()).toEqual([
      expect.objectContaining({
        owner_user_id: 41,
        retries: 0,
        body: expect.objectContaining({ client_comment_request_id: "request-1" }),
      }),
    ]);
  });

  it("coalesces concurrent replay attempts so a mutation is sent once", async () => {
    const queue = await freshQueue();
    queue.enqueueRequest(queuedInput(41));
    let resolveRequest: ((response: Response) => void) | undefined;
    const perform = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));

    const first = queue.replayQueue(41, perform);
    const second = queue.replayQueue(41, perform);
    await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    resolveRequest?.(new Response(null, { status: 204 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { delivered: 1, remaining: 0 },
      { delivered: 1, remaining: 0 },
    ]);
  });
});
