import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PMListItem } from "@/app/lib/api/pm-contracts";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import PreventiveMaintenanceDashboard from "./PreventiveMaintenanceDashboard";

const mocks = vi.hoisted(() => ({
  fetchList: vi.fn(),
  fetchStatistics: vi.fn(),
  getUpcoming: vi.fn(),
  state: {
    error: null as string | null,
    statistics: {
      counts: { total: 37, pending: 11, overdue: 4, completed: 22 },
      frequency_distribution: { monthly: 5 },
      upcoming: [],
      avg_completion_times: {},
    },
  },
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({ data: { user: { id: "5005", accessToken: "token-a" } } }),
}));

vi.mock("@/app/lib/hooks/usePreventiveMaintenanceActions", () => ({
  usePreventiveMaintenanceActions: () => ({
    maintenanceItems: [],
    statistics: mocks.state.statistics,
    isLoading: false,
    error: mocks.state.error,
    fetchMaintenanceItems: mocks.fetchList,
    fetchStatistics: mocks.fetchStatistics,
  }),
}));

vi.mock("@/app/lib/PreventiveMaintenanceService", () => ({
  createPreventiveMaintenanceService: () => ({
    getAllPreventiveMaintenance: mocks.getUpcoming,
  }),
  preventiveMaintenanceService: {
    debugMaintenanceData: vi.fn(),
  },
}));

function pm(pmId: string, title: string, propertyId: string): PMListItem {
  return {
    pm_id: pmId,
    pmtitle: title,
    scheduled_date: "2026-08-20T00:00:00Z",
    next_due_date: "2026-09-20T00:00:00Z",
    completed_date: null,
    frequency: "monthly",
    status: "pending",
    topics: [],
    machines: [],
    property_id: [propertyId],
  } as unknown as PMListItem;
}

function page(items: PMListItem[], currentPage = 1, count = items.length, pageSize = 10) {
  return {
    success: true,
    data: {
      results: items,
      count,
      current_page: currentPage,
      total_pages: Math.max(1, Math.ceil(count / pageSize)),
      page_size: pageSize,
      next: null,
      previous: null,
    },
  };
}

function deferredPage() {
  let resolve!: (value: ReturnType<typeof page>) => void;
  const promise = new Promise<ReturnType<typeof page>>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

beforeEach(() => {
  useAuthStore.setState({ selectedProperty: "1001" });
  mocks.fetchList.mockReset().mockResolvedValue(undefined);
  mocks.fetchStatistics.mockReset().mockResolvedValue(undefined);
  mocks.getUpcoming.mockReset();
  mocks.state.error = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Preventive Maintenance dashboard Property and pagination workflow", () => {
  it("fetches Property B page 1 once and ignores the late Property A upcoming response", async () => {
    const propertyA = deferredPage();
    const propertyB = deferredPage();
    mocks.getUpcoming.mockImplementation((params: { property_id: string }) =>
      params.property_id === "2002" ? propertyB.promise : propertyA.promise,
    );
    render(<PreventiveMaintenanceDashboard />);

    await waitFor(() => expect(mocks.getUpcoming).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.setState({ selectedProperty: "2002" }));
    await waitFor(() => expect(mocks.getUpcoming).toHaveBeenCalledTimes(2));
    expect(mocks.fetchList).toHaveBeenLastCalledWith({ page: 1, page_size: 10 });
    expect(mocks.getUpcoming).toHaveBeenLastCalledWith(
      expect.objectContaining({ property_id: "2002", page: 1, page_size: 10 }),
    );

    propertyB.resolve(page([pm("4004", "Property B PM", "2002")], 1, 1));
    await screen.findByText("Property B PM");
    propertyA.resolve(page([pm("3003", "Property A PM", "1001")], 1, 1));
    await act(async () => propertyA.promise);

    expect(screen.queryByText("Property A PM")).not.toBeInTheDocument();
    expect(screen.getByText("Property B PM")).toBeInTheDocument();
  });

  it("uses the authoritative count and sends one canonical page-2 request", async () => {
    mocks.getUpcoming.mockImplementation((params: { page: number; page_size: number }) =>
      Promise.resolve(page(
        [pm(params.page === 2 ? "4004" : "3003", params.page === 2 ? "Page 2 PM" : "Page 1 PM", "1001")],
        params.page,
        20,
        params.page_size,
      )),
    );
    render(<PreventiveMaintenanceDashboard />);

    await screen.findByText("Page 1 PM");
    expect(screen.getByText("Total: 20 tasks")).toBeInTheDocument();
    mocks.getUpcoming.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("Page 2 PM");
    expect(mocks.getUpcoming).toHaveBeenCalledTimes(1);
    expect(mocks.getUpcoming).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: "1001", page: 2, page_size: 10 }),
    );
  });

  it("resets to page 1 and sends one request when page size changes", async () => {
    mocks.getUpcoming.mockImplementation((params: { page: number; page_size: number }) =>
      Promise.resolve(page([pm("3003", "Upcoming PM", "1001")], params.page, 50, params.page_size)),
    );
    render(<PreventiveMaintenanceDashboard />);
    await screen.findByText("Upcoming PM");
    mocks.getUpcoming.mockClear();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "25" } });

    await waitFor(() => expect(mocks.getUpcoming).toHaveBeenCalledTimes(1));
    expect(mocks.getUpcoming).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: "1001", page: 1, page_size: 25 }),
    );
  });

  it("does not recreate the main fetch merely because an empty dashboard rerenders", async () => {
    mocks.getUpcoming.mockResolvedValue(page([], 1, 0));
    const view = render(<PreventiveMaintenanceDashboard />);
    await waitFor(() => expect(mocks.fetchList).toHaveBeenCalledTimes(1));

    view.rerender(<PreventiveMaintenanceDashboard />);
    await act(async () => Promise.resolve());

    expect(mocks.fetchList).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStatistics).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("37").length).toBeGreaterThan(0);
    expect(screen.getAllByText("11").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("22").length).toBeGreaterThan(0);

    mocks.state.error = "Network unavailable";
    view.rerender(<PreventiveMaintenanceDashboard />);
    expect(screen.getByText("Network unavailable")).toBeInTheDocument();
    mocks.state.error = "Server rejected request";
    view.rerender(<PreventiveMaintenanceDashboard />);
    expect(screen.getByText("Server rejected request")).toBeInTheDocument();
    expect(mocks.fetchList).toHaveBeenCalledTimes(1);
  });
});
