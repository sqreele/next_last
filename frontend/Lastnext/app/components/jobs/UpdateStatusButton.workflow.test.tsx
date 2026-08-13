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
import type { Job, JobStatus } from "@/app/lib/types";
import UpdateStatusButton from "./UpdateStatusButton";

const mocks = vi.hoisted(() => ({
  session: {
    user: {
      id: "auth0|user-505",
      username: "engineer-505",
      accessToken: "access-token-505",
    },
    currentUser: {
      id: 606,
      user_id: 505,
      username: "engineer-505",
    },
  },
  sessionStatus: "authenticated",
  toast: vi.fn(),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: mocks.session,
    status: mocks.sessionStatus,
  }),
}));

vi.mock("@/app/lib/csrf", () => ({
  getCsrfHeaders: vi.fn().mockResolvedValue({ "X-CSRFToken": "csrf-505" }),
}));

vi.mock("@/app/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/app/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/app/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Status"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const jobA: Job = {
  id: 701,
  job_id: "101",
  description: "Inspect AHU vibration",
  status: "pending",
  priority: "medium",
  remarks: "Authoritative old remarks",
  is_defective: false,
  is_preventivemaintenance: false,
  property_id: "202",
  area: {
    id: 404,
    name: "Mechanical Area",
    is_active: true,
    property_id: "202",
    property_name: "Property 202",
  },
  rooms: [
    {
      room_id: 303,
      name: "Plant Room",
      room_type: "plant",
      is_active: true,
      properties: ["202"],
    },
  ],
  topics: [{ id: 808, title: "HVAC", description: "Air handling" }],
  user: 505,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T01:00:00Z",
  completed_at: null,
};

const jobB: Job = {
  ...jobA,
  id: 702,
  job_id: "102",
  description: "Inspect lift controls",
  property_id: "909",
  rooms: [{ ...jobA.rooms![0], room_id: 707, name: "Lift Motor Room" }],
};

function authoritativeJob(
  status: JobStatus = "in_progress",
  overrides: Partial<Job> = {},
): Job {
  return {
    ...jobA,
    status,
    updated_at: "2026-08-13T09:30:00Z",
    updated_by: "engineer-505",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(
  mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(mutation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function renderButton(
  onStatusUpdated = vi.fn(),
  propertyContextKey: string | null = "202",
) {
  return {
    onStatusUpdated,
    view: render(
      <UpdateStatusButton
        job={jobA}
        onStatusUpdated={onStatusUpdated}
        propertyContextKey={propertyContextKey}
      />,
    ),
  };
}

function openAndSelect(status: JobStatus) {
  fireEvent.click(screen.getByRole("button", { name: "Update Status" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
    target: { value: status },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
}

beforeEach(() => {
  mocks.session.user.id = "auth0|user-505";
  mocks.session.user.username = "engineer-505";
  mocks.session.user.accessToken = "access-token-505";
  mocks.session.currentUser.id = 606;
  mocks.session.currentUser.user_id = 505;
  mocks.session.currentUser.username = "engineer-505";
  mocks.sessionStatus = "authenticated";
  mocks.toast.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("active single Job status workflow", () => {
  it("sends the exact canonical Job ID, status, endpoint, method, and minimal payload once", async () => {
    const returned = authoritativeJob("waiting_sparepart");
    const fetchMock = installFetch(async () => jsonResponse(returned));
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("waiting_sparepart");
    submit();

    await waitFor(() => expect(onStatusUpdated).toHaveBeenCalledWith(returned));
    expect(patchCalls(fetchMock)).toHaveLength(1);
    const [url, request] = patchCalls(fetchMock)[0] as [string, RequestInit];
    expect(new URL(String(url)).pathname).toBe("/api/v1/jobs/101/");
    expect(request).toEqual(
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token-505",
          "Content-Type": "application/json",
          "X-CSRFToken": "csrf-505",
        }),
      }),
    );
    expect(JSON.parse(String(request.body))).toEqual({
      status: "waiting_sparepart",
    });
  });

  it("does not reconcile or announce success before the server resolves", async () => {
    let resolveRequest!: (response: Response) => void;
    installFetch(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("in_progress");
    submit();

    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Status Updated" }),
    );
    expect(
      screen.getByRole("button", { name: "Loading Saving..." }),
    ).toBeDisabled();

    await waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    resolveRequest(jsonResponse(authoritativeJob()));
    await waitFor(() => expect(onStatusUpdated).toHaveBeenCalledTimes(1));
  });

  it("blocks two rapid form submissions from creating duplicate mutations", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = installFetch(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderButton();
    openAndSelect("in_progress");
    const form = screen.getByRole("button", { name: "Update" }).closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    resolveRequest(jsonResponse(authoritativeJob()));
  });

  it("reconciles from the complete server-returned Job object", async () => {
    const returned = authoritativeJob("cancelled", {
      updated_at: "2026-08-13T10:45:00Z",
      remarks: "Server-authoritative remarks",
    });
    installFetch(async () => jsonResponse(returned));
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("cancelled");
    submit();

    await waitFor(() => expect(onStatusUpdated).toHaveBeenCalledWith(returned));
    expect(onStatusUpdated.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({ updated_at: jobA.updated_at }),
    );
  });

  it("updates only Job A and leaves a distinct Job B unchanged", async () => {
    installFetch(async () => jsonResponse(authoritativeJob()));

    function Harness() {
      const [jobs, setJobs] = React.useState([jobA, jobB]);
      const reconcile = (updated: Job) =>
        setJobs((current) =>
          current.map((job) =>
            job.job_id === updated.job_id ? updated : job,
          ),
        );
      return (
        <>
          {jobs.map((job) => (
            <div key={job.job_id}>
              <span data-testid={`status-${job.job_id}`}>{job.status}</span>
              <UpdateStatusButton
                job={job}
                onStatusUpdated={reconcile}
                propertyContextKey={
                  job.property_id == null ? null : String(job.property_id)
                }
              />
            </div>
          ))}
        </>
      );
    }

    render(<Harness />);
    const controls = screen.getAllByRole("button", { name: "Update Status" });
    fireEvent.click(controls[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "in_progress" },
    });
    submit();

    await waitFor(() =>
      expect(screen.getByTestId("status-101")).toHaveTextContent("in_progress"),
    );
    expect(screen.getByTestId("status-102")).toHaveTextContent("pending");
  });

  it.each([
    [400, "Invalid status value."],
    [403, "You do not have access to this Job."],
  ])("preserves the old status and recovers after a %s response", async (status, detail) => {
    const fetchMock = installFetch(async () => jsonResponse({ detail }, status));
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("in_progress");
    submit();

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Update Failed",
          description: detail,
          variant: "destructive",
        }),
      ),
    );
    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("does not automatically retry a network failure and remains recoverable", async () => {
    const fetchMock = installFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("in_progress");
    submit();

    await waitFor(
      () =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Update Failed" }),
        ),
      { timeout: 5000 },
    );
    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("does not automatically retry a 500 response or commit local success", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse({ detail: "Temporary server failure." }, 500),
    );
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("in_progress");
    submit();

    await waitFor(
      () =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Update Failed",
            description: "Temporary server failure.",
          }),
        ),
      { timeout: 5000 },
    );
    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(onStatusUpdated).not.toHaveBeenCalled();
  });

  it("ignores Property A authority after the active property switches to B", async () => {
    let resolveRequest!: (response: Response) => void;
    installFetch(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onStatusUpdated = vi.fn();
    const { view } = renderButton(onStatusUpdated, "202");
    openAndSelect("in_progress");
    submit();

    await waitFor(() => expect(resolveRequest).toBeTypeOf("function"));

    view.rerender(
      <UpdateStatusButton
        job={jobA}
        onStatusUpdated={onStatusUpdated}
        propertyContextKey="909"
      />,
    );
    resolveRequest(jsonResponse(authoritativeJob()));
    await act(async () => undefined);

    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Status Updated" }),
    );
  });

  it("ignores User A authority after the active session switches to User B", async () => {
    let resolveRequest!: (response: Response) => void;
    installFetch(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onStatusUpdated = vi.fn();
    const { view } = renderButton(onStatusUpdated);
    openAndSelect("in_progress");
    submit();

    await waitFor(() => expect(resolveRequest).toBeTypeOf("function"));

    mocks.session.user.id = "auth0|user-999";
    mocks.session.user.accessToken = "access-token-999";
    mocks.session.currentUser.user_id = 999;
    view.rerender(
      <UpdateStatusButton
        job={jobA}
        onStatusUpdated={onStatusUpdated}
        propertyContextKey="202"
      />,
    );
    resolveRequest(jsonResponse(authoritativeJob()));
    await act(async () => undefined);

    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Status Updated" }),
    );
  });

  it("ignores a pending response after the Job control unmounts", async () => {
    let resolveRequest!: (response: Response) => void;
    installFetch(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onStatusUpdated = vi.fn();
    const { view } = renderButton(onStatusUpdated);
    openAndSelect("in_progress");
    submit();

    await waitFor(() => expect(resolveRequest).toBeTypeOf("function"));

    view.unmount();
    resolveRequest(jsonResponse(authoritativeJob()));
    await act(async () => undefined);

    expect(onStatusUpdated).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Status Updated" }),
    );
  });

  it("does not send a mutation when the selected status is unchanged", () => {
    const fetchMock = installFetch(async () => jsonResponse(jobA));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Update Status" }));
    const form = screen.getByRole("button", { name: "Update" }).closest("form");

    fireEvent.submit(form!);

    expect(patchCalls(fetchMock)).toHaveLength(0);
  });

  it("allows a clean retry after failure and then reconciles server authority", async () => {
    let attempt = 0;
    const returned = authoritativeJob("completed", {
      completed_at: "2026-08-13T11:00:00Z",
    });
    const fetchMock = installFetch(async () => {
      attempt += 1;
      return attempt === 1
        ? jsonResponse({ detail: "Status conflict." }, 409)
        : jsonResponse(returned);
    });
    const onStatusUpdated = vi.fn();
    renderButton(onStatusUpdated);

    openAndSelect("completed");
    submit();
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Update Failed",
          description: "Status conflict.",
        }),
      ),
    );
    expect(onStatusUpdated).not.toHaveBeenCalled();

    submit();

    await waitFor(() => expect(onStatusUpdated).toHaveBeenCalledWith(returned));
    expect(patchCalls(fetchMock)).toHaveLength(2);
  });
});
