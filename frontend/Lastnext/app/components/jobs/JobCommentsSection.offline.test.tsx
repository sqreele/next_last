import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, getQueue } from "@/app/lib/offline-queue";
import JobCommentsSection from "./JobCommentsSection";

const workflow = vi.hoisted(() => ({
  ownerUserId: 41,
  selectedProperty: "PROPERTY-A" as string | null,
}));

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: axiosMocks.get,
    post: axiosMocks.post,
    isAxiosError: (error: unknown) =>
      Boolean((error as { isAxiosError?: boolean } | null)?.isAxiosError),
  },
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        accessToken: `token-${workflow.ownerUserId}`,
        username: `engineer-${workflow.ownerUserId}`,
        first_name: `Engineer ${workflow.ownerUserId}`,
      },
      currentUser: { user_id: workflow.ownerUserId },
    },
  }),
}));

vi.mock("@/app/lib/stores/useAuthStore", () => ({
  useAuthStore: () => ({ selectedProperty: workflow.selectedProperty }),
}));

const requestIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function submitComment(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
}

function axiosFailure(status: number) {
  return {
    isAxiosError: true,
    message: `Request failed with ${status}`,
    response: { status, data: { detail: `Rejected ${status}` } },
  };
}

function serverComment(
  id: number,
  comment: string,
  clientRequestId: string,
) {
  return {
    id,
    job: 1,
    comment,
    client_comment_request_id: clientRequestId,
    author_id: 41,
    author_username: "engineer-41",
    author_name: "Engineer 41",
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
  };
}

beforeEach(() => {
  clearQueue();
  workflow.ownerUserId = 41;
  workflow.selectedProperty = "PROPERTY-A";
  axiosMocks.get.mockReset().mockResolvedValue({ data: [] });
  axiosMocks.post.mockReset();
  setOnline(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  let index = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => requestIds[index++] as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  clearQueue();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Job comments online/offline idempotency workflow", () => {
  it("queues one immutable owner-bound request and restores it after remount", async () => {
    const first = render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    submitComment("Air conditioner still leaking");

    await screen.findByText("Pending sync");
    expect(axiosMocks.post).not.toHaveBeenCalled();
    expect(getQueue()).toEqual([
      expect.objectContaining({
        owner_user_id: 41,
        endpoint: "/api/v1/jobs/JOB-1/comments/",
        method: "POST",
        body: {
          comment: "Air conditioner still leaking",
          client_comment_request_id: requestIds[0],
        },
      }),
    ]);

    first.unmount();
    render(<JobCommentsSection jobId="JOB-1" />);
    await waitFor(() =>
      expect(screen.getByText("Air conditioner still leaking")).toBeInTheDocument(),
    );
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    expect(getQueue()[0]?.body.client_comment_request_id).toBe(requestIds[0]);
  });

  it("does not render both an authoritative comment and its remounted pending mutation", async () => {
    const first = render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");
    submitComment("Already committed on the server");
    await screen.findByText("Pending sync");
    first.unmount();

    axiosMocks.get.mockResolvedValue({
      data: [serverComment(90, "Already committed on the server", requestIds[0])],
    });
    render(<JobCommentsSection jobId="JOB-1" />);

    await waitFor(() =>
      expect(screen.getAllByText("Already committed on the server")).toHaveLength(1),
    );
    expect(screen.queryByText("Pending sync")).not.toBeInTheDocument();
    expect(getQueue()).toHaveLength(1);
  });

  it("sends one generated request ID online and leaves no queued mutation", async () => {
    setOnline(true);
    const authoritative = serverComment(91, "Online comment", requestIds[0]);
    axiosMocks.post.mockResolvedValue({ data: authoritative });
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    submitComment("Online comment");

    await screen.findByText("Online comment");
    expect(axiosMocks.post).toHaveBeenCalledWith(
      "/api/jobs/JOB-1/comments/",
      {
        comment: "Online comment",
        client_comment_request_id: requestIds[0],
      },
      { withCredentials: true },
    );
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(getQueue()).toEqual([]);
    expect(screen.getAllByText("Online comment")).toHaveLength(1);
  });

  it("keeps the direct request ID after a lost response and reconciles one server comment", async () => {
    setOnline(true);
    const authoritative = serverComment(92, "Committed before disconnect", requestIds[0]);
    axiosMocks.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValue({ data: [authoritative] });
    let rejectDirect!: (error: unknown) => void;
    axiosMocks.post.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectDirect = reject; }),
    );
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    submitComment("Committed before disconnect");
    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(1));
    setOnline(false);
    await act(async () => rejectDirect(new TypeError("response lost")));
    await waitFor(() => expect(getQueue()).toHaveLength(1));
    expect(getQueue()[0]?.body.client_comment_request_id).toBe(requestIds[0]);

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, replayInit] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(replayInit?.body))).toEqual({
      comment: "Committed before disconnect",
      client_comment_request_id: requestIds[0],
    });
    await waitFor(() => expect(getQueue()).toEqual([]));
    await waitFor(() =>
      expect(screen.getAllByText("Committed before disconnect")).toHaveLength(1),
    );
    expect(screen.queryByText("Pending sync")).not.toBeInTheDocument();
  });

  it("replays a network-before-write queue with the original identity", async () => {
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");
    submitComment("Created only during replay");
    await waitFor(() => expect(getQueue()).toHaveLength(1));

    setOnline(true);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, replayInit] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(replayInit?.body)).client_comment_request_id).toBe(requestIds[0]);
    await waitFor(() => expect(getQueue()).toEqual([]));
  });

  it.each([400, 403])("does not queue a non-retryable %s response", async (status) => {
    setOnline(true);
    axiosMocks.post.mockRejectedValue(axiosFailure(status));
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    submitComment(`Rejected ${status}`);

    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(1));
    expect(getQueue()).toEqual([]);
    expect(screen.queryByText("Pending sync")).not.toBeInTheDocument();
  });

  it("guards a rapid double submit as one logical request", async () => {
    setOnline(true);
    let resolvePost!: (value: { data: ReturnType<typeof serverComment> }) => void;
    axiosMocks.post.mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");
    fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
      target: { value: "Only once" },
    });
    const form = screen.getByRole("button", { name: "Add Comment" }).closest("form");

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(axiosMocks.post).toHaveBeenCalledTimes(1);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
    resolvePost({ data: serverComment(93, "Only once", requestIds[0]) });
    await screen.findByText("Only once");
  });

  it("uses distinct identities for two intentional comments with identical text", async () => {
    setOnline(true);
    axiosMocks.post
      .mockResolvedValueOnce({ data: serverComment(94, "Repeat me", requestIds[0]) })
      .mockResolvedValueOnce({ data: serverComment(95, "Repeat me", requestIds[1]) });
    render(<JobCommentsSection jobId="JOB-1" />);
    await screen.findByText("No comments yet");

    submitComment("Repeat me");
    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByPlaceholderText("Write a comment…")).toHaveValue(""));
    submitComment("Repeat me");
    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(2));

    expect(axiosMocks.post.mock.calls.map((call) => call[1].client_comment_request_id))
      .toEqual([requestIds[0], requestIds[1]]);
    expect(screen.getAllByText("Repeat me")).toHaveLength(2);
  });

  it("does not apply a late Property A response after switching to Property B", async () => {
    setOnline(true);
    let resolvePost!: (value: { data: ReturnType<typeof serverComment> }) => void;
    axiosMocks.post.mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );
    const view = render(<JobCommentsSection jobId="JOB-A" />);
    await screen.findByText("No comments yet");
    submitComment("Property A late response");
    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(1));

    workflow.selectedProperty = "PROPERTY-B";
    view.rerender(<JobCommentsSection jobId="JOB-A" />);
    await act(async () => {
      resolvePost({ data: serverComment(96, "Property A late response", requestIds[0]) });
    });

    expect(screen.queryByText("Property A late response", { selector: "p" }))
      .not.toBeInTheDocument();
    expect(getQueue()).toEqual([]);
  });

  it("keeps a failed User A mutation owner-bound after User B becomes active", async () => {
    setOnline(true);
    let rejectPost!: (error: unknown) => void;
    axiosMocks.post.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectPost = reject; }),
    );
    const view = render(<JobCommentsSection jobId="JOB-A" />);
    await screen.findByText("No comments yet");
    submitComment("User A unresolved");
    await waitFor(() => expect(axiosMocks.post).toHaveBeenCalledTimes(1));

    workflow.ownerUserId = 84;
    view.rerender(<JobCommentsSection jobId="JOB-A" />);
    setOnline(false);
    await act(async () => rejectPost(new TypeError("response lost")));

    expect(getQueue()).toEqual([
      expect.objectContaining({
        owner_user_id: 41,
        endpoint: "/api/v1/jobs/JOB-A/comments/",
        body: expect.objectContaining({ client_comment_request_id: requestIds[0] }),
      }),
    ]);
    expect(screen.queryByText("User A unresolved", { selector: "p" }))
      .not.toBeInTheDocument();
  });
});
