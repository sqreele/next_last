import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssigneeRef } from "@/app/lib/api/assignee-contracts";
import type { Job } from "@/app/lib/types";
import { ReassignJobButton } from "./ReassignJobButton";

const mocks = vi.hoisted(() => ({
  selectedPropertyId: "PROPERTY-A" as string | null,
  sessionUserId: "auth0|reassign-user",
  accessToken: "reassign-access-token",
  assignees: [] as AssigneeRef[],
  routerRefresh: vi.fn(),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: mocks.sessionUserId,
        accessToken: mocks.accessToken,
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/app/lib/hooks/useAssigneeOptions", () => ({
  useAssigneeOptions: () => ({
    assignees: mocks.assignees,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({ selectedPropertyId: mocks.selectedPropertyId }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("@/app/lib/csrf", () => ({
  getCsrfHeaders: async () => ({ "X-CSRFToken": "reassign-csrf-token" }),
}));

const targetA: AssigneeRef = {
  user_id: 41,
  profile_id: 941,
  username: "target-a",
  email: "target-a@example.com",
  first_name: "Target",
  last_name: "Teammate",
  display_name: "Target Teammate",
  positions: "Engineer",
  properties: [{ id: 9001, property_id: "PROPERTY-A", name: "Property A" }],
};

const targetB: AssigneeRef = {
  user_id: 42,
  profile_id: 942,
  username: "target-b",
  email: "target-b@example.com",
  first_name: "Foreign",
  last_name: "Teammate",
  display_name: "Foreign Teammate",
  positions: "Engineer",
  properties: [{ id: 9002, property_id: "PROPERTY-B", name: "Property B" }],
};

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 501,
    job_id: "JOB-501",
    description: "Reassignment workflow fixture",
    status: "pending",
    priority: "medium",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    completed_at: null,
    user: 7,
    user_name: "Current Assignee",
    remarks: "",
    rooms: [],
    area: null,
    ...overrides,
  };
}

const roomA = {
  room_id: 101,
  name: "Room A",
  room_type: "Plant",
  properties: ["PROPERTY-A"],
};

const areaA = {
  id: 201,
  name: "Area A",
  is_active: true,
  property_id: "PROPERTY-A",
  property_name: "Property A",
};

const areaB = {
  id: 202,
  name: "Area B",
  is_active: true,
  property_id: "PROPERTY-B",
  property_name: "Property B",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installMutation(
  mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(mutation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

function renderFlow(item: Job, onComplete?: () => void | Promise<void>) {
  return render(<ReassignJobButton job={item} onComplete={onComplete} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Reassign this job" }));
}

function chooseTarget() {
  fireEvent.click(screen.getByRole("button", { name: /Target Teammate/ }));
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.selectedPropertyId = "PROPERTY-A";
  mocks.sessionUserId = "auth0|reassign-user";
  mocks.accessToken = "reassign-access-token";
  mocks.assignees = [targetA, targetB];
  mocks.routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("active Job reassignment workflow", () => {
  it("uses room-only property scope", () => {
    renderFlow(job({ rooms: [roomA] }));
    openDialog();

    expect(screen.getByRole("button", { name: /Target Teammate/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foreign Teammate/ })).not.toBeInTheDocument();
  });

  it("uses area-only property scope", () => {
    renderFlow(job({ area: areaA }));
    openDialog();

    expect(screen.getByRole("button", { name: /Target Teammate/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foreign Teammate/ })).not.toBeInTheDocument();
  });

  it("accepts matching room and area property scope", () => {
    renderFlow(job({ rooms: [roomA], area: areaA }));
    openDialog();

    expect(screen.getByRole("button", { name: /Target Teammate/ })).toBeInTheDocument();
    expect(screen.queryByText(/scope is unavailable or ambiguous/i)).not.toBeInTheDocument();
  });

  it("fails closed when room and area properties conflict", () => {
    renderFlow(job({ rooms: [roomA], area: areaB }));
    openDialog();

    expect(screen.getByText(/scope is unavailable or ambiguous/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Target Teammate/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reassign" })).toBeDisabled();
  });

  it("fails closed without a property instead of falling back to all users", () => {
    renderFlow(job());
    openDialog();

    expect(screen.getByText(/scope is unavailable or ambiguous/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Target Teammate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foreign Teammate/ })).not.toBeInTheDocument();
  });

  it("excludes a foreign-property user", () => {
    renderFlow(job({ rooms: [roomA] }));
    openDialog();

    expect(screen.queryByText("Foreign Teammate")).not.toBeInTheDocument();
  });

  it("sends canonical user_id and never profile_id", async () => {
    const fetchMock = installMutation(async () =>
      jsonResponse({ job_id: "JOB-501", assignee: "Target Teammate", previous: "Current" }),
    );
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    const request = postCalls(fetchMock)[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ user_id: 41 });
    expect(String(request.body)).not.toContain("941");
  });

  it("does not automatically retry a failed reassignment", async () => {
    const fetchMock = installMutation(async () =>
      jsonResponse({ detail: "Service unavailable" }, 503),
    );
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    await screen.findByText("Service unavailable");
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("guards rapid double submit with one request", async () => {
    const pending = deferredResponse();
    const fetchMock = installMutation(() => pending.promise);
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();

    const button = screen.getByRole("button", { name: "Reassign" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    pending.resolve(jsonResponse({ job_id: "JOB-501" }));
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not report or reconcile success before the server resolves", async () => {
    const pending = deferredResponse();
    installMutation(() => pending.promise);
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reassigning/ })).toBeDisabled();
    expect(mocks.routerRefresh).not.toHaveBeenCalled();

    pending.resolve(jsonResponse({ job_id: "JOB-501" }));
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("reconciles successful reassignment through authoritative refresh", async () => {
    installMutation(async () => jsonResponse({ job_id: "JOB-501" }));
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("preserves dialog, target, and note after a 400 response", async () => {
    installMutation(async () => jsonResponse({ detail: "Ambiguous property" }, 400));
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Keep this note" },
    });
    submit();

    await screen.findByText("Ambiguous property");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Target Teammate/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this note");
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });

  it("preserves dialog and local assignment state after a 403 response", async () => {
    installMutation(async () => jsonResponse({ detail: "Forbidden target" }, 403));
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    await screen.findByText("Forbidden target");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Target Teammate/ })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });

  it("recovers from a network failure only through an explicit retry", async () => {
    let attempt = 0;
    const fetchMock = installMutation(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("Network unavailable");
      return jsonResponse({ job_id: "JOB-501" });
    });
    renderFlow(job({ rooms: [roomA] }));
    openDialog();
    chooseTarget();
    submit();

    await screen.findByText("Network unavailable");
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Target Teammate/ })).toHaveAttribute("aria-pressed", "true");

    submit();
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2));
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not reconcile a Property A response after switching to Property B", async () => {
    const pending = deferredResponse();
    installMutation(() => pending.promise);
    const item = job({ rooms: [roomA] });
    const view = renderFlow(item);
    openDialog();
    chooseTarget();
    submit();

    mocks.selectedPropertyId = "PROPERTY-B";
    view.rerender(<ReassignJobButton job={item} />);
    await act(async () => {
      pending.resolve(jsonResponse({ job_id: "JOB-501" }));
    });

    expect(mocks.routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not let the selected global property override the Job property", () => {
    mocks.selectedPropertyId = "PROPERTY-B";
    renderFlow(job({ rooms: [roomA] }));
    openDialog();

    expect(screen.getByRole("button", { name: /Target Teammate/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Foreign Teammate/ })).not.toBeInTheDocument();
  });

  it("does not reconcile an old session response into a new session", async () => {
    const pending = deferredResponse();
    installMutation(() => pending.promise);
    const item = job({ rooms: [roomA] });
    const view = renderFlow(item);
    openDialog();
    chooseTarget();
    submit();

    mocks.sessionUserId = "auth0|next-user";
    mocks.accessToken = "next-user-token";
    view.rerender(<ReassignJobButton job={item} />);
    await act(async () => {
      pending.resolve(jsonResponse({ job_id: "JOB-501" }));
    });

    expect(mocks.routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
