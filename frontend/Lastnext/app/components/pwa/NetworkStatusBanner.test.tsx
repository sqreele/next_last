import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkStatusBanner } from "./NetworkStatusBanner";

const offlineHook = vi.hoisted(() => ({
  drain: vi.fn(),
  item: {
    id: "queue-1",
    owner_user_id: 41,
    kind: "job-status-update" as const,
    label: "#JOB-1 → completed",
    endpoint: "/api/v1/jobs/JOB-1/",
    method: "PATCH" as const,
    body: { status: "completed" },
    createdAt: 1,
    retries: 0,
  },
}));

vi.mock("@/app/lib/hooks/useOfflineQueue", () => ({
  useOfflineQueue: () => ({
    queue: [offlineHook.item],
    count: 1,
    drain: offlineHook.drain,
    isDraining: false,
  }),
}));

beforeEach(() => {
  offlineHook.drain.mockReset().mockResolvedValue({ delivered: 1, remaining: 0 });
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: false,
  });
});

describe("NetworkStatusBanner recovery UI", () => {
  it("shows owner-visible queued work, transitions online, and offers one manual replay", async () => {
    render(<NetworkStatusBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Offline");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("#JOB-1 → completed")).toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("status")).toHaveTextContent("pending sync");

    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));
    expect(offlineHook.drain).toHaveBeenCalledTimes(1);
  });
});
