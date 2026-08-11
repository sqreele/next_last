import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompatSession } from "@/app/lib/auth0/session-compat";
import { clearQueue, enqueueRequest, getQueue } from "@/app/lib/offline-queue";
import { useOfflineQueue } from "./useOfflineQueue";

let activeSession: CompatSession | null = null;

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: activeSession,
    status: activeSession?.user ? "authenticated" : "unauthenticated",
  }),
}));

function session(userId: number, accessToken: string): CompatSession {
  return {
    user: {
      id: `auth0|${userId}`,
      username: `user-${userId}`,
      email: null,
      profile_image: null,
      positions: "Technician",
      properties: [],
      accessToken,
      created_at: "2026-08-11T00:00:00Z",
    },
    currentUser: {
      id: userId + 1000,
      profile_id: userId + 1000,
      user_id: userId,
      username: `user-${userId}`,
      email: `user-${userId}@example.com`,
      first_name: "Test",
      last_name: "User",
      display_name: "Test User",
      profile_image: null,
      positions: "Technician",
      properties: [],
      user_property_name: null,
      user_property_id: null,
      profile_property_name: null,
      profile_property_id: null,
      created_at: "2026-08-11T00:00:00Z",
      email_notifications_enabled: true,
    },
  };
}

function enqueueFor(ownerUserId: number) {
  return enqueueRequest({
    owner_user_id: ownerUserId,
    kind: "job-status-update",
    label: "#JOB-1 → completed",
    endpoint: "/api/v1/jobs/JOB-1/",
    method: "PATCH",
    body: { status: "completed", completed_at: null },
  });
}

beforeEach(() => {
  clearQueue();
  activeSession = null;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  clearQueue();
  vi.unstubAllGlobals();
});

describe("useOfflineQueue session-safe recovery", () => {
  it("hides and does not replay User A work while User B is active", async () => {
    enqueueFor(41);
    activeSession = session(84, "token-b");

    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.count).toBe(0);
    expect(result.current.queue).toEqual([]);
    window.dispatchEvent(new Event("online"));
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(getQueue()).toHaveLength(1);
  });

  it("replays the original payload with a refreshed token for the same backend user", async () => {
    enqueueFor(41);
    activeSession = session(41, "refreshed-token-a");

    const { result } = renderHook(() => useOfflineQueue());

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/jobs/JOB-1/"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer refreshed-token-a" }),
        body: JSON.stringify({ status: "completed", completed_at: null }),
      }),
    );
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(getQueue()).toEqual([]);
  });

  it("does not replay without a resolved CurrentUser identity", async () => {
    enqueueFor(41);
    activeSession = {
      ...session(41, "token-a"),
      currentUser: undefined,
    };

    const { result } = renderHook(() => useOfflineQueue());
    await act(async () => {
      expect(await result.current.drain()).toEqual({ delivered: 0, remaining: 0 });
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(getQueue()).toHaveLength(1);
  });

  it("coalesces mount and repeated online recovery events", async () => {
    enqueueFor(41);
    activeSession = session(41, "token-a");
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );

    renderHook(() => useOfflineQueue());
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    resolveFetch?.(new Response(null, { status: 204 }));
    await waitFor(() => expect(getQueue()).toHaveLength(0));
  });
});
