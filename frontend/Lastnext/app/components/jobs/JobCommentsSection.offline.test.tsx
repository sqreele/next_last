import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, getQueue } from "@/app/lib/offline-queue";
import JobCommentsSection from "./JobCommentsSection";

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: axiosMocks.get,
    post: axiosMocks.post,
    isAxiosError: () => false,
  },
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        accessToken: "token-a",
        username: "engineer-a",
        first_name: "Engineer A",
      },
      currentUser: { user_id: 41 },
    },
  }),
}));

beforeEach(() => {
  clearQueue();
  axiosMocks.get.mockReset().mockResolvedValue({ data: [] });
  axiosMocks.post.mockReset();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  clearQueue();
});

describe("Job comments offline workflow", () => {
  it("queues one owner-bound mutation and restores its pending UI after remount", async () => {
    const first = render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
      target: { value: "Air conditioner still leaking" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));

    await screen.findByText("Pending sync");
    expect(axiosMocks.post).not.toHaveBeenCalled();
    expect(getQueue()).toEqual([
      expect.objectContaining({
        owner_user_id: 41,
        endpoint: "/api/v1/jobs/JOB-1/comments/",
        method: "POST",
        body: { comment: "Air conditioner still leaking" },
      }),
    ]);

    first.unmount();
    render(<JobCommentsSection jobId="JOB-1" />);
    await waitFor(() => expect(screen.getByText("Air conditioner still leaking")).toBeInTheDocument());
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    expect(getQueue()).toHaveLength(1);
  });
});
