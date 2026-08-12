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
import type { Job, Property, TabValue } from "@/app/lib/types";
import JobList from "./jobList";

const mocks = vi.hoisted(() => ({
  selectedProperty: "9001" as string | null,
  session: {
    user: {
      id: "auth0|batch-user",
      accessToken: "batch-access-token",
    },
  },
  initialJobs: [] as Job[],
  authoritativeJobs: [] as Job[],
  replaceJobs: undefined as ((jobs: Job[]) => void) | undefined,
  changeFilter: undefined as ((filter: TabValue) => void) | undefined,
  refreshJobs: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({ data: mocks.session, status: "authenticated" }),
}));

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({ selectedPropertyId: mocks.selectedProperty }),
  useProperties: () => ({ properties }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("@/app/components/jobs/MaintenanceJobCard", () => ({
  default: ({ job }: { job: Job }) => (
    <div>
      <span>{job.description}</span>
      <span data-testid={`status-${job.job_id}`}>{job.status}</span>
    </div>
  ),
}));

vi.mock("@/app/components/jobs/JobActions", () => ({
  default: () => null,
}));

vi.mock("@/app/components/jobs/Pagination", () => ({
  default: ({ onPageChange }: { onPageChange: (page: number) => void }) => (
    <button type="button" onClick={() => onPageChange(2)}>
      Go to page 2
    </button>
  ),
}));

vi.mock("@/app/lib/utils/csv-export", () => ({
  jobsToCSV: vi.fn(() => ""),
  downloadCSV: vi.fn(),
}));

vi.mock("@/app/lib/utils/excel-export", () => ({
  exportJobsToExcel: vi.fn(),
}));

const properties: Property[] = [
  { id: 9001, property_id: "9001", name: "Property A" },
  { id: 9002, property_id: "9002", name: "Property B" },
];

function job(
  jobId: string,
  propertyId: string,
  overrides: Partial<Job> = {},
): Job {
  return {
    id: Number(jobId) + 500,
    job_id: jobId,
    description: `Job ${jobId}`,
    status: "pending",
    priority: "medium",
    created_at: `2026-01-${jobId === "101" ? "03" : jobId === "202" ? "02" : "01"}T00:00:00Z`,
    updated_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    user: 41,
    remarks: "Batch fixture",
    property_id: propertyId,
    rooms: [
      {
        room_id: Number(jobId) + 700,
        name: `Room ${Number(jobId) + 700}`,
        room_type: "guest_room",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        properties: [propertyId],
      },
    ],
    ...overrides,
  };
}

const jobA = job("101", "9001");
const jobB = job("202", "9001");
const jobC = job("303", "9001");
const propertyBJob = job("404", "9002", { description: "Property B Job" });

function cloneJobs(jobs: Job[]): Job[] {
  return jobs.map((item) => ({
    ...item,
    rooms: item.rooms?.map((room) => ({ ...room })),
  }));
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
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/csrf-token/")) {
      return Promise.resolve(jsonResponse({ csrfToken: "batch-csrf-token" }));
    }
    if (init?.method === "PATCH") return mutation(input, init);
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function patchCallsFor(fetchMock: ReturnType<typeof vi.fn>, jobId: string) {
  return patchCalls(fetchMock).filter(([url]) =>
    new URL(String(url)).pathname.endsWith(`/jobs/${jobId}/`),
  );
}

function Harness({ withRefresh = true }: { withRefresh?: boolean }) {
  const [jobs, setJobs] = React.useState(() => cloneJobs(mocks.initialJobs));
  const [filter, setFilter] = React.useState<TabValue>("all");
  mocks.replaceJobs = (nextJobs) => setJobs(cloneJobs(nextJobs));
  mocks.changeFilter = setFilter;

  const refresh = async () => {
    mocks.refreshJobs();
    setJobs(cloneJobs(mocks.authoritativeJobs));
  };

  return (
    <JobList
      jobs={jobs}
      filter={filter}
      properties={properties}
      onRefresh={withRefresh ? refresh : undefined}
    />
  );
}

async function selectJobs(jobIds: string[]) {
  fireEvent.click(screen.getByRole("button", { name: "Select" }));
  for (const jobId of jobIds) {
    fireEvent.click(
      await screen.findByRole("button", { name: `Select job ${jobId}` }),
    );
  }
}

function chooseStatus(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: "Status" }));
  const choice = screen.getByRole("button", { name: label });
  fireEvent.click(choice);
  return choice;
}

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.selectedProperty = "9001";
  mocks.session.user.id = "auth0|batch-user";
  mocks.session.user.accessToken = "batch-access-token";
  mocks.initialJobs = cloneJobs([jobA, jobB, jobC]);
  mocks.authoritativeJobs = cloneJobs([jobA, jobB, jobC]);
  mocks.replaceJobs = undefined;
  mocks.changeFilter = undefined;
  mocks.refreshJobs.mockReset();
  mocks.routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("active Job Batch Status workflow", () => {
  it("sends one exact mutation per selected Job and reconciles full success only after authority", async () => {
    let resolveJobA!: (response: Response) => void;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/101/")) {
        return new Promise<Response>((resolve) => { resolveJobA = resolve; });
      }
      return jsonResponse(job("202", "9001", {
        status: "in_progress",
        updated_at: "2026-02-02T02:02:02Z",
      }));
    });
    render(<Harness />);
    await selectJobs(["101", "202"]);
    mocks.authoritativeJobs = cloneJobs([
      job("101", "9001", {
        status: "in_progress",
        updated_at: "2026-02-01T01:01:01Z",
      }),
      job("202", "9001", {
        status: "in_progress",
        updated_at: "2026-02-02T02:02:02Z",
      }),
      jobC,
    ]);

    const choice = chooseStatus(/In Progress/i);
    fireEvent.click(choice);

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    expect(screen.getByTestId("status-101")).toHaveTextContent("pending");
    expect(screen.getByTestId("status-202")).toHaveTextContent("pending");
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
    expect(screen.queryByText(/Updated 2 of 2/)).not.toBeInTheDocument();

    resolveJobA(jsonResponse(job("101", "9001", {
      status: "in_progress",
      updated_at: "2026-02-01T01:01:01Z",
    })));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(2));
    await waitFor(() => expect(mocks.refreshJobs).toHaveBeenCalledTimes(1));
    expect(patchCallsFor(fetchMock, "101")).toHaveLength(1);
    expect(patchCallsFor(fetchMock, "202")).toHaveLength(1);
    expect(patchCallsFor(fetchMock, "303")).toHaveLength(0);
    for (const [url, request] of patchCalls(fetchMock) as Array<
      [string, RequestInit]
    >) {
      expect(["/api/v1/jobs/101/", "/api/v1/jobs/202/"]).toContain(
        new URL(String(url)).pathname,
      );
      expect(request).toEqual(expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer batch-access-token",
          "Content-Type": "application/json",
          "X-CSRFToken": "batch-csrf-token",
        }),
      }));
      expect(JSON.parse(String(request.body))).toEqual({ status: "in_progress" });
    }
    expect(await screen.findByTestId("status-101")).toHaveTextContent(
      "in_progress",
    );
    expect(screen.getByTestId("status-202")).toHaveTextContent("in_progress");
    expect(screen.getByTestId("status-303")).toHaveTextContent("pending");
    expect(screen.queryByRole("region", { name: "Batch actions" })).not.toBeInTheDocument();
  });

  it("reconciles partial success per Job, retains only the failed Job, and retries it alone", async () => {
    let jobBAttempt = 0;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/202/")) {
        jobBAttempt += 1;
        if (jobBAttempt === 1) {
          return jsonResponse({ detail: "Not authorized for Job 202." }, 403);
        }
      }
      const jobId = path.match(/jobs\/(\d+)\/$/)?.[1] || "0";
      return jsonResponse(job(jobId, "9001", {
        status: "completed",
        completed_at: `2026-03-${jobId === "101" ? "01" : jobId === "202" ? "02" : "03"}T03:03:03Z`,
      }));
    });
    render(<Harness />);
    await selectJobs(["101", "202", "303"]);
    mocks.authoritativeJobs = cloneJobs([
      job("101", "9001", {
        status: "completed",
        completed_at: "2026-03-01T03:03:03Z",
      }),
      jobB,
      job("303", "9001", {
        status: "completed",
        completed_at: "2026-03-03T03:03:03Z",
      }),
    ]);

    chooseStatus(/Completed/);

    await screen.findByText("Updated 2 of 3 jobs. 1 failed.");
    expect(mocks.refreshJobs).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("status-101")).toHaveTextContent(
      "completed",
    );
    expect(screen.getByTestId("status-202")).toHaveTextContent("pending");
    expect(screen.getByTestId("status-303")).toHaveTextContent("completed");
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select job 101" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Deselect job 202" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Select job 303" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(JSON.parse(String(patchCallsFor(fetchMock, "101")[0][1]?.body))).toEqual({
      status: "completed",
    });

    mocks.authoritativeJobs = cloneJobs([
      mocks.authoritativeJobs[0],
      job("202", "9001", {
        status: "completed",
        completed_at: "2026-03-02T03:03:03Z",
      }),
      mocks.authoritativeJobs[2],
    ]);
    chooseStatus(/Completed/);

    await waitFor(() => expect(mocks.refreshJobs).toHaveBeenCalledTimes(2));
    expect(patchCallsFor(fetchMock, "101")).toHaveLength(1);
    expect(patchCallsFor(fetchMock, "202")).toHaveLength(2);
    expect(patchCallsFor(fetchMock, "303")).toHaveLength(1);
    expect(await screen.findByTestId("status-202")).toHaveTextContent(
      "completed",
    );
    expect(screen.queryByRole("region", { name: "Batch actions" })).not.toBeInTheDocument();
  });

  it("preserves every Job and selection after a full 400 failure", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse({ detail: "Completed jobs cannot change status." }, 400),
    );
    render(<Harness />);
    await selectJobs(["101", "202"]);

    chooseStatus(/Waiting Sparepart/i);

    await screen.findByText("Updated 0 of 2 jobs. 2 failed.");
    expect(patchCalls(fetchMock)).toHaveLength(2);
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
    expect(screen.getByTestId("status-101")).toHaveTextContent("pending");
    expect(screen.getByTestId("status-202")).toHaveTextContent("pending");
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
  });

  it("does not let a pending Property A result mutate or refresh Property B", async () => {
    let resolveJobA!: (response: Response) => void;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/101/")) {
        return new Promise<Response>((resolve) => { resolveJobA = resolve; });
      }
      return jsonResponse(jobB);
    });
    render(<Harness />);
    await selectJobs(["101", "202"]);
    chooseStatus(/In Progress/i);
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));

    mocks.selectedProperty = "9002";
    act(() => mocks.replaceJobs?.([propertyBJob]));
    await screen.findByText("Property B Job");

    resolveJobA(jsonResponse(job("101", "9001", { status: "in_progress" })));
    await act(async () => {});

    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
    expect(screen.getByTestId("status-404")).toHaveTextContent("pending");
    expect(screen.queryByRole("region", { name: "Batch actions" })).not.toBeInTheDocument();
  });

  it("ignores a pending result after the active filter changes", async () => {
    let resolveJobA!: (response: Response) => void;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/101/")) {
        return new Promise<Response>((resolve) => { resolveJobA = resolve; });
      }
      return jsonResponse(jobB);
    });
    render(<Harness />);
    await selectJobs(["101", "202"]);
    chooseStatus(/In Progress/i);
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));

    act(() => mocks.changeFilter?.("completed"));
    await waitFor(() => {
      expect(screen.queryByText("Job 101")).not.toBeInTheDocument();
    });
    resolveJobA(jsonResponse(job("101", "9001", { status: "in_progress" })));
    await act(async () => {});

    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
  });

  it("ignores a pending result after the active page changes", async () => {
    let resolveJobA!: (response: Response) => void;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/101/")) {
        return new Promise<Response>((resolve) => { resolveJobA = resolve; });
      }
      return jsonResponse(jobB);
    });
    mocks.initialJobs = cloneJobs([
      jobA,
      jobB,
      ...Array.from({ length: 23 }, (_, index) =>
        job(String(1000 + index), "9001"),
      ),
    ]);
    render(<Harness />);
    await selectJobs(["101", "202"]);
    chooseStatus(/In Progress/i);
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Go to page 2" }));
    resolveJobA(jsonResponse(job("101", "9001", { status: "in_progress" })));
    await act(async () => {});

    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
  });

  it("mutates only the exact Jobs selected across loaded pages", async () => {
    const pagedJobs = [
      jobA,
      jobB,
      ...Array.from({ length: 23 }, (_, index) =>
        job(String(1000 + index), "9001"),
      ),
    ];
    const fetchMock = installFetch(async (input) => {
      const jobId = new URL(String(input)).pathname.match(/jobs\/(\d+)\/$/)?.[1] || "0";
      return jsonResponse(job(jobId, "9001", { status: "completed" }));
    });
    mocks.initialJobs = cloneJobs(pagedJobs);
    mocks.authoritativeJobs = cloneJobs(
      pagedJobs.map((item) =>
        item.job_id === "101" || item.job_id === "1022"
          ? { ...item, status: "completed" as const }
          : item,
      ),
    );
    render(<Harness />);
    await selectJobs(["101"]);
    fireEvent.click(screen.getByRole("button", { name: "Go to page 2" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Select job 1022" }),
    );

    chooseStatus(/Completed/);

    await waitFor(() => expect(mocks.refreshJobs).toHaveBeenCalledTimes(1));
    expect(patchCalls(fetchMock)).toHaveLength(2);
    expect(patchCallsFor(fetchMock, "101")).toHaveLength(1);
    expect(patchCallsFor(fetchMock, "1022")).toHaveLength(1);
    expect(patchCallsFor(fetchMock, "202")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Batch actions" })).not.toBeInTheDocument();
  });

  it("does not reconcile an old user's pending result into a new session", async () => {
    let resolveJobA!: (response: Response) => void;
    const fetchMock = installFetch(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/jobs/101/")) {
        return new Promise<Response>((resolve) => { resolveJobA = resolve; });
      }
      return jsonResponse(jobB);
    });
    render(<Harness />);
    await selectJobs(["101", "202"]);
    chooseStatus(/In Progress/i);
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));

    mocks.session.user.id = "auth0|next-user";
    mocks.session.user.accessToken = "next-user-token";
    act(() => mocks.replaceJobs?.([jobA, jobB, jobC]));
    resolveJobA(jsonResponse(job("101", "9001", { status: "in_progress" })));
    await act(async () => {});

    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(mocks.refreshJobs).not.toHaveBeenCalled();
    expect(screen.getByTestId("status-101")).toHaveTextContent("pending");
  });

  it("uses router refresh as authoritative fallback when no refresh callback is provided", async () => {
    const fetchMock = installFetch(async (input) => {
      const jobId = new URL(String(input)).pathname.match(/jobs\/(\d+)\/$/)?.[1] || "0";
      return jsonResponse(job(jobId, "9001", { status: "in_progress" }));
    });
    render(<Harness withRefresh={false} />);
    await selectJobs(["101"]);

    chooseStatus(/In Progress/i);

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });
});
