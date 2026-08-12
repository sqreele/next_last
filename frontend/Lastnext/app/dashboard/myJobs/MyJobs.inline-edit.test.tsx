import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyJobs from "./myJobs";

const mocks = vi.hoisted(() => ({
  jobsSeed: [] as Array<Record<string, unknown>>,
  selectedProperty: "PROPERTY-A-47",
  replaceJobs: undefined as
    | React.Dispatch<React.SetStateAction<Array<Record<string, unknown>>>>
    | undefined,
  localUpdate: vi.fn(),
  refreshJobs: vi.fn().mockResolvedValue(true),
  storeUpdate: vi.fn(),
  storeDelete: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "auth0|session-901",
        username: "session-user",
        accessToken: "access-token-a",
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/app/lib/hooks/useJobsData", async () => {
  const ReactModule = await import("react");
  return {
    useJobsData: () => {
      const [jobs, setJobs] = ReactModule.useState(mocks.jobsSeed);
      mocks.replaceJobs = setJobs;
      const updateJob = ReactModule.useCallback((updatedJob: Record<string, unknown>) => {
        mocks.localUpdate(updatedJob);
        setJobs((current) =>
          current.map((job) =>
            String(job.job_id) === String(updatedJob.job_id) ? updatedJob : job,
          ),
        );
      }, []);
      return {
        jobs,
        setJobs,
        addJob: vi.fn(),
        updateJob,
        removeJob: vi.fn(),
        isLoading: false,
        error: null,
        activePropertyId: null,
        refreshJobs: mocks.refreshJobs,
        lastRefreshed: null,
      };
    },
  };
});

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({
    selectedPropertyId: mocks.selectedProperty,
    userProfile: {
      id: 810,
      user_id: 73,
      first_name: "Engineer",
      last_name: "A",
    },
  }),
  useJobs: () => ({
    updateJob: mocks.storeUpdate,
    deleteJob: mocks.storeDelete,
  }),
}));

vi.mock("@/app/lib/csrf", () => ({
  getCsrfHeaders: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/app/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/app/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/app/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  AlertDialogAction: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogCancel: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/app/components/ui/select", () => ({
  Select: ({
    children,
    name,
    defaultValue,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    name?: string;
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <select
      aria-label={name === "priority" ? "Priority" : "Selection"}
      name={name}
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("@/app/components/ui/checkbox", () => {
  const Checkbox = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
  >(
    (props, ref) => <input ref={ref} type="checkbox" {...props} />,
  );
  Checkbox.displayName = "MockCheckbox";
  return { Checkbox };
});

vi.mock("@/app/components/jobs/CreateJobButton", () => ({ default: () => null }));
vi.mock("@/app/components/jobs/Pagination", () => ({ default: () => null }));
vi.mock("@/app/components/jobs/UpdateStatusButton", () => ({
  default: () => <button type="button">Update Status</button>,
}));
vi.mock("@/app/components/StatusBadge", () => ({ StatusBadge: () => <span>Status</span> }));
vi.mock("@/app/components/pcms-ui", () => ({ FloatingActionButton: () => null }));
vi.mock("@/app/components/feedback/FeedbackState", () => ({
  FeedbackState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/app/components/layout/PageContainer", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/app/components/layout/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header><h1>{title}</h1>{actions}</header>
  ),
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const topic = {
  id: 311,
  title: "Electrical",
  description: "Electrical equipment",
};

const jobA = {
  id: 731,
  job_id: "JOB-418",
  title: "Pump inspection",
  description: "Inspect pump vibration",
  status: "in_progress",
  priority: "medium",
  remarks: "Initial inspection",
  is_defective: false,
  is_preventivemaintenance: false,
  property_id: "PROPERTY-A-47",
  rooms: [{ room_id: 206, name: "Pump Room", room_type: "plant" }],
  topics: [topic],
  user: { id: 73, username: "engineer-a", first_name: "Engineer", last_name: "A" },
  user_name: "Engineer A",
  created_at: "2026-08-01T01:00:00Z",
  updated_at: "2026-08-02T02:00:00Z",
  completed_at: null,
};

const jobB = {
  ...jobA,
  id: 944,
  job_id: "JOB-902",
  title: "Boiler inspection",
  description: "Property B authoritative description",
  property_id: "PROPERTY-B-88",
  rooms: [{ room_id: 509, name: "Boiler Room", room_type: "plant" }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function prioritySelect() {
  const select = document.querySelector('select[name="priority"]');
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("Inline priority select was not rendered");
  }
  return select;
}

function installFetch(
  mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/topics/")) {
      return Promise.resolve(jsonResponse({ results: [topic] }));
    }
    if (init?.method === "PATCH") return mutation(input, init);
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openEdit() {
  render(<MyJobs />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByRole("heading", { name: "Edit Job #JOB-418" });
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/topics/?property=PROPERTY-A-47"),
    expect.any(Object),
  ));
}

beforeEach(() => {
  mocks.jobsSeed = [{ ...jobA, topics: [{ ...topic }], rooms: [...jobA.rooms] }];
  mocks.selectedProperty = "PROPERTY-A-47";
  mocks.replaceJobs = undefined;
  mocks.localUpdate.mockReset();
  mocks.refreshJobs.mockClear();
  mocks.storeUpdate.mockReset();
  mocks.storeDelete.mockReset();
  mocks.toast.mockReset();
  mocks.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("My Jobs inline edit workflow", () => {
  it("PATCHes the canonical Job exactly once and reconciles only after authoritative success", async () => {
    let resolvePatch!: (response: Response) => void;
    const fetchMock = installFetch(
      () => new Promise<Response>((resolve) => { resolvePatch = resolve; }),
    );
    await openEdit();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Repair pump vibration" },
    });
    fireEvent.change(prioritySelect(), {
      target: { value: "high" },
    });
    fireEvent.change(screen.getByLabelText("Remarks"), {
      target: { value: "Replace worn bearing" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Defective" }));

    const save = screen.getByRole("button", { name: "Save Changes" });
    const form = save.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    const [url, request] = patchCalls(fetchMock)[0] as [string, RequestInit];
    expect(new URL(String(url)).pathname).toBe("/api/v1/jobs/JOB-418/");
    expect(request).toEqual(expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      headers: expect.objectContaining({
        Authorization: "Bearer access-token-a",
        "Content-Type": "application/json",
      }),
    }));
    expect(JSON.parse(String(request.body))).toEqual({
      description: "Repair pump vibration",
      priority: "high",
      remarks: "Replace worn bearing",
      is_defective: true,
      is_preventivemaintenance: false,
      topic_data: {
        title: "Electrical",
        description: "Electrical equipment",
      },
    });

    expect(screen.getByText("Inspect pump vibration", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Job #JOB-418" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(mocks.localUpdate).not.toHaveBeenCalled();
    expect(mocks.storeUpdate).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Success" }));

    const authoritative = {
      ...jobA,
      description: "Server-normalized pump repair",
      priority: "high",
      remarks: "Replace worn bearing",
      is_defective: true,
      updated_at: "2026-08-12T04:00:00Z",
    };
    resolvePatch(jsonResponse(authoritative));

    await screen.findByText("Server-normalized pump repair");
    expect(screen.queryByRole("heading", { name: "Edit Job #JOB-418" })).not.toBeInTheDocument();
    expect(mocks.localUpdate).toHaveBeenCalledWith(authoritative);
    expect(mocks.storeUpdate).toHaveBeenCalledWith(731, authoritative);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Success",
      description: "Job updated successfully.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit Job #JOB-418" });
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Server-normalized pump repair",
    );
  });

  it("preserves edits after a 400 and retries with the user's latest value", async () => {
    let attempt = 0;
    const fetchMock = installFetch(async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse({ detail: "Description is invalid." }, 400);
      return jsonResponse({ ...jobA, description: "Retry accepted by server" });
    });
    await openEdit();

    const description = screen.getByLabelText("Description");
    fireEvent.change(description, { target: { value: "Recoverable draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled());
    expect(screen.getByLabelText("Description")).toHaveValue("Recoverable draft");
    expect(screen.getByText("Inspect pump vibration", { selector: "p" })).toBeInTheDocument();
    expect(mocks.localUpdate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Update Failed",
      variant: "destructive",
    }));

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Latest retry draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText("Retry accepted by server");
    expect(patchCalls(fetchMock)).toHaveLength(2);
    expect(JSON.parse(String(patchCalls(fetchMock)[1][1]?.body))).toEqual(
      expect.objectContaining({ description: "Latest retry draft" }),
    );
  });

  it("does not commit an unauthorized 403 response", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse({ detail: "You do not have access to this property." }, 403),
    );
    await openEdit();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Unauthorized change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled());
    expect(screen.getByLabelText("Description")).toHaveValue("Unauthorized change");
    expect(screen.getByText("Inspect pump vibration", { selector: "p" })).toBeInTheDocument();
    expect(mocks.localUpdate).not.toHaveBeenCalled();
    expect(mocks.storeUpdate).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Success" }));
  });

  it("recovers from a network rejection without losing the draft", async () => {
    const fetchMock = installFetch(async () => {
      throw new Error("Connection lost");
    });
    await openEdit();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Draft during outage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled());
    expect(screen.getByLabelText("Description")).toHaveValue("Draft during outage");
    expect(mocks.localUpdate).not.toHaveBeenCalled();
    expect(mocks.storeUpdate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Update Failed",
      variant: "destructive",
    }));
  });

  it("cancels without mutation and re-enters from authoritative row state", async () => {
    const fetchMock = installFetch(async () => jsonResponse(jobA));
    await openEdit();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Discard this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Edit Job #JOB-418" })).not.toBeInTheDocument();
    expect(patchCalls(fetchMock)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit Job #JOB-418" });
    expect(screen.getByLabelText("Description")).toHaveValue("Inspect pump vibration");
  });

  it("does not let a Property A response overwrite the visible Property B job", async () => {
    let resolvePatch!: (response: Response) => void;
    const fetchMock = installFetch(
      () => new Promise<Response>((resolve) => { resolvePatch = resolve; }),
    );
    const view = render(<MyJobs />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit Job #JOB-418" });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Property A pending change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));

    mocks.selectedProperty = "PROPERTY-B-88";
    act(() => mocks.replaceJobs?.([{ ...jobB }]));
    view.rerender(<MyJobs />);
    expect(screen.getByText("Property B authoritative description")).toBeInTheDocument();

    resolvePatch(jsonResponse({ ...jobA, description: "Property A server result" }));
    await waitFor(() => expect(mocks.localUpdate).toHaveBeenCalled());
    expect(screen.getByText("Property B authoritative description")).toBeInTheDocument();
    expect(screen.queryByText("Property A server result")).not.toBeInTheDocument();
  });
});
