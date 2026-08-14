import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/app/lib/api-client";
import apiClient from "@/app/lib/api-client";
import type { PMListItem } from "@/app/lib/api/pm-contracts";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import { useFilterStore } from "@/app/lib/stores/useFilterStore";
import { usePreventiveMaintenanceStore } from "@/app/lib/stores/usePreventiveMaintenanceStore";
import PreventiveMaintenanceListPage from "@/app/dashboard/preventive-maintenance/page";
import { usePreventiveMaintenanceActions } from "./usePreventiveMaintenanceActions";

const session = vi.hoisted(() => ({
  userId: "505",
  accessToken: "token-user-a",
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        id: session.userId,
        accessToken: session.accessToken,
      },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function pm(pmId: string, propertyId: string, title: string): PMListItem {
  return {
    pm_id: pmId,
    pmtitle: title,
    job_id: null,
    job_description: null,
    scheduled_date: "2026-08-13T00:00:00Z",
    completed_date: null,
    frequency: "monthly",
    next_due_date: "2026-09-13T00:00:00Z",
    status: "pending",
    topics: [],
    machines: [
      {
        id: 202,
        machine_id: "202",
        name: "Canonical machine 202",
        property: 303,
        property_id: propertyId,
      } as unknown as PMListItem["machines"][number],
    ],
    property_id: [propertyId],
    procedure: null,
    notes: null,
    before_image_url: null,
    after_image_url: null,
    procedure_template: 404,
    procedure_template_id: 404,
    procedure_template_name: "Schedule 404",
    master_plan: null,
    occurrence_due_date: null,
    generated_at: null,
    assigned_to_details: null,
    created_by_details: null,
    assigned_to_name: null,
    technician_name: null,
    created_by_name: null,
  };
}

const pmA = pm("101", "303", "PM A");
const pmB = pm("102", "303", "PM B");
const propertyBItem = pm("201", "PROPERTY-B", "Property B PM");
const nextSessionItem = pm("301", "PROPERTY-A", "Next session PM");

function deferredDelete() {
  let resolve!: (value: { status: number; data: string }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ status: number; data: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function deferredList() {
  let resolve!: (value: { data: ReturnType<typeof listPage> }) => void;
  const promise = new Promise<{ data: ReturnType<typeof listPage> }>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function listPage(
  items: PMListItem[],
  pagination: { count?: number; totalPages?: number; currentPage?: number; pageSize?: number } = {},
) {
  return {
    count: pagination.count ?? items.length,
    total_pages: pagination.totalPages ?? 1,
    current_page: pagination.currentPage ?? 1,
    page_size: pagination.pageSize ?? 10,
    next: null,
    previous: null,
    results: items,
  };
}

function seed(items: PMListItem[] = [pmA, pmB]) {
  usePreventiveMaintenanceStore.setState({
    maintenanceItems: items,
    totalCount: items.length,
    isLoading: false,
    error: null,
    filterParams: { page: 1, page_size: 10, property_id: "303" },
  });
}

beforeEach(() => {
  session.userId = "505";
  session.accessToken = "token-user-a";
  useAuthStore.setState({ selectedProperty: "303" });
  useFilterStore.setState({
    status: "all",
    frequency: "all",
    search: "",
    start_date: "",
    end_date: "",
    machine_id: "",
    page: 1,
    page_size: 10,
  });
  seed();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("active PM list delete workflow", () => {
  it("keeps the list fetch callback stable after a successful state update", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({ data: listPage([pmA]) });
    const view = renderHook(() => usePreventiveMaintenanceActions());
    const initialFetch = view.result.current.fetchMaintenanceItems;

    await act(async () => {
      await initialFetch({ page: 1, page_size: 10 });
    });

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/preventive-maintenance/",
      expect.objectContaining({
        params: expect.objectContaining({ property_id: "303", page: 1, page_size: 10 }),
      }),
    );
    expect(view.result.current.fetchMaintenanceItems).toBe(initialFetch);
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([pmA]);
  });

  it("ignores a late Property A list after Property B is selected", async () => {
    const propertyARequest = deferredList();
    const propertyBRequest = deferredList();
    vi.spyOn(apiClient, "get").mockImplementation((_url, config) =>
      (config?.params as { property_id?: string } | undefined)?.property_id === "PROPERTY-B"
        ? propertyBRequest.promise
        : propertyARequest.promise,
    );
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let propertyAFetch!: Promise<void>;
    act(() => {
      propertyAFetch = view.result.current.fetchMaintenanceItems({ page: 1, page_size: 10 });
    });
    act(() => {
      useAuthStore.setState({ selectedProperty: "PROPERTY-B" });
    });
    let propertyBFetch!: Promise<void>;
    act(() => {
      propertyBFetch = view.result.current.fetchMaintenanceItems({ page: 1, page_size: 10 });
    });

    propertyBRequest.resolve({ data: listPage([propertyBItem]) });
    await act(async () => propertyBFetch);
    propertyARequest.resolve({ data: listPage([pmA]) });
    await act(async () => propertyAFetch);

    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [propertyBItem],
      totalCount: 1,
      filterParams: { page: 1, page_size: 10 },
    });
  });

  it("keeps the newest page when an older page response arrives late", async () => {
    const pageOneRequest = deferredList();
    const pageTwoRequest = deferredList();
    vi.spyOn(apiClient, "get").mockImplementation((_url, config) =>
      (config?.params as { page?: number } | undefined)?.page === 2
        ? pageTwoRequest.promise
        : pageOneRequest.promise,
    );
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let pageOneFetch!: Promise<void>;
    let pageTwoFetch!: Promise<void>;
    act(() => {
      pageOneFetch = view.result.current.fetchMaintenanceItems({ page: 1, page_size: 10 });
      pageTwoFetch = view.result.current.fetchMaintenanceItems({ page: 2, page_size: 10 });
    });

    pageTwoRequest.resolve({
      data: listPage([pmB], { count: 20, totalPages: 2, currentPage: 2 }),
    });
    await act(async () => pageTwoFetch);
    pageOneRequest.resolve({
      data: listPage([pmA], { count: 20, totalPages: 2, currentPage: 1 }),
    });
    await act(async () => pageOneFetch);

    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [pmB],
      totalCount: 20,
      filterParams: { page: 2, page_size: 10 },
    });
  });

  it("ignores a stale pre-filter response and keeps the filtered metadata", async () => {
    const unfilteredRequest = deferredList();
    const filteredRequest = deferredList();
    vi.spyOn(apiClient, "get").mockImplementation((_url, config) =>
      (config?.params as { search?: string } | undefined)?.search === "pump"
        ? filteredRequest.promise
        : unfilteredRequest.promise,
    );
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let unfilteredFetch!: Promise<void>;
    let filteredFetch!: Promise<void>;
    act(() => {
      unfilteredFetch = view.result.current.fetchMaintenanceItems({ page: 2, page_size: 10 });
      filteredFetch = view.result.current.fetchMaintenanceItems({ page: 1, page_size: 10, search: "pump" });
    });

    filteredRequest.resolve({
      data: listPage([pmB], { count: 1, totalPages: 1, currentPage: 1 }),
    });
    await act(async () => filteredFetch);
    unfilteredRequest.resolve({
      data: listPage([pmA], { count: 20, totalPages: 2, currentPage: 2 }),
    });
    await act(async () => unfilteredFetch);

    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [pmB],
      totalCount: 1,
      filterParams: { page: 1, page_size: 10 },
    });
  });

  it("does not update list or pagination metadata after unmount", async () => {
    const pending = deferredList();
    vi.spyOn(apiClient, "get").mockImplementation(() => pending.promise);
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let fetchPromise!: Promise<void>;
    act(() => {
      fetchPromise = view.result.current.fetchMaintenanceItems({ page: 2, page_size: 25 });
    });
    view.unmount();
    seed([propertyBItem]);

    pending.resolve({
      data: listPage([pmA], { count: 50, totalPages: 2, currentPage: 2, pageSize: 25 }),
    });
    await act(async () => fetchPromise);

    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [propertyBItem],
      totalCount: 1,
      filterParams: { page: 1, page_size: 10 },
    });
  });

  it("sends the canonical PM identity once and keeps all PMs while DELETE is pending", async () => {
    const pending = deferredDelete();
    const deleteMock = vi.spyOn(apiClient, "delete").mockImplementation(() => pending.promise);
    const { result } = renderHook(() => usePreventiveMaintenanceActions());

    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    act(() => {
      first = result.current.deleteMaintenance(pmA.pm_id);
      duplicate = result.current.deleteMaintenance(pmA.pm_id);
    });

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0][0]).toBe("/api/v1/preventive-maintenance/101/");
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([pmA, pmB]);

    pending.resolve({ status: 204, data: "" });
    await expect(first).resolves.toBe(true);
    await expect(duplicate).resolves.toBe(false);
  });

  it("removes only the deleted PM after authoritative 204 success", async () => {
    vi.spyOn(apiClient, "delete").mockResolvedValue({ status: 204, data: "" });
    const { result } = renderHook(() => usePreventiveMaintenanceActions());

    await act(async () => {
      await expect(result.current.deleteMaintenance("101")).resolves.toBe(true);
    });

    const state = usePreventiveMaintenanceStore.getState();
    expect(state.maintenanceItems).toEqual([pmB]);
    expect(state.totalCount).toBe(1);
  });

  it("preserves both PMs after a network failure and allows an explicit retry", async () => {
    const deleteMock = vi.spyOn(apiClient, "delete")
      .mockRejectedValueOnce(new ApiError("Network unavailable"))
      .mockResolvedValueOnce({ status: 204, data: "" });
    const { result } = renderHook(() => usePreventiveMaintenanceActions());

    await act(async () => {
      await expect(result.current.deleteMaintenance("101")).resolves.toBe(false);
    });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([pmA, pmB]);
    expect(usePreventiveMaintenanceStore.getState().isLoading).toBe(false);

    await act(async () => {
      await expect(result.current.deleteMaintenance("101")).resolves.toBe(true);
    });
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([pmB]);
  });

  it.each([
    [403, "Forbidden"],
    [409, "Protected schedule conflict"],
  ])("preserves PM state after a %s server failure", async (status, message) => {
    vi.spyOn(apiClient, "delete").mockRejectedValue(
      new ApiError(message, status, { detail: message }),
    );
    const { result } = renderHook(() => usePreventiveMaintenanceActions());

    await act(async () => {
      await expect(result.current.deleteMaintenance("101")).resolves.toBe(false);
    });

    const state = usePreventiveMaintenanceStore.getState();
    expect(state.maintenanceItems).toEqual([pmA, pmB]);
    expect(state.totalCount).toBe(2);
    expect(state.error).toContain(message);
  });

  it("does not apply a Property A success after the view switches to Property B", async () => {
    const pending = deferredDelete();
    vi.spyOn(apiClient, "delete").mockImplementation(() => pending.promise);
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let deletion!: Promise<boolean>;
    act(() => {
      deletion = view.result.current.deleteMaintenance("101");
    });
    act(() => {
      useAuthStore.setState({ selectedProperty: "PROPERTY-B" });
      seed([propertyBItem]);
    });

    pending.resolve({ status: 204, data: "" });
    await expect(deletion).resolves.toBe(false);
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([propertyBItem]);
    expect(usePreventiveMaintenanceStore.getState().totalCount).toBe(1);
  });

  it("does not apply an old-session success to the next user's PM state", async () => {
    const pending = deferredDelete();
    vi.spyOn(apiClient, "delete").mockImplementation(() => pending.promise);
    const view = renderHook(() => usePreventiveMaintenanceActions());

    let deletion!: Promise<boolean>;
    act(() => {
      deletion = view.result.current.deleteMaintenance("101");
    });
    session.userId = "606";
    session.accessToken = "token-user-b";
    seed([nextSessionItem]);
    view.rerender();

    pending.resolve({ status: 204, data: "" });
    await expect(deletion).resolves.toBe(false);
    expect(usePreventiveMaintenanceStore.getState().maintenanceItems).toEqual([nextSessionItem]);
    expect(usePreventiveMaintenanceStore.getState().totalCount).toBe(1);
  });
});

describe("PM list page fetch and pagination orchestration", () => {
  it("sends one canonical page-1 request when Property changes and preserves page size", async () => {
    useFilterStore.setState({ page: 3, page_size: 25 });
    usePreventiveMaintenanceStore.setState({
      filterParams: { page: 3, page_size: 25, property_id: "303" },
    });
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: listPage([pmA], { currentPage: 1, pageSize: 25 }),
    });
    render(<PreventiveMaintenanceListPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    getMock.mockClear();

    act(() => useAuthStore.setState({ selectedProperty: "PROPERTY-B" }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenLastCalledWith(
      "/api/v1/preventive-maintenance/",
      expect.objectContaining({
        params: expect.objectContaining({ property_id: "PROPERTY-B", page: 1, page_size: 25 }),
      }),
    );
    expect(useFilterStore.getState()).toMatchObject({ page: 1, page_size: 25 });
  });

  it("sends exactly one request for a page change", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockImplementation((_url, config) => {
      const requestedPage = (config?.params as { page?: number } | undefined)?.page ?? 1;
      return Promise.resolve({
        data: listPage(requestedPage === 2 ? [pmB] : [pmA], {
          count: 20,
          totalPages: 2,
          currentPage: requestedPage,
        }),
      });
    });
    render(<PreventiveMaintenanceListPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    getMock.mockClear();

    act(() => useFilterStore.getState().setPage(2));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock.mock.calls[0][1]?.params).toEqual(expect.objectContaining({ page: 2, page_size: 10 }));
  });

  it("resets to page 1 and sends one request when page size changes", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: listPage([pmA], { count: 30, totalPages: 3, currentPage: 1, pageSize: 10 }),
    });
    render(<PreventiveMaintenanceListPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    getMock.mockClear();

    getMock.mockResolvedValue({
      data: listPage([pmA], { count: 30, totalPages: 2, currentPage: 1, pageSize: 25 }),
    });
    act(() => useFilterStore.getState().setPageSize(25));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock.mock.calls[0][1]?.params).toEqual(expect.objectContaining({ page: 1, page_size: 25 }));
    expect(useFilterStore.getState()).toMatchObject({ page: 1, page_size: 25 });
  });

  it("settles an empty out-of-range response on page 1 without another request", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockImplementation((_url, config) => {
      const requestedPage = (config?.params as { page?: number } | undefined)?.page ?? 1;
      return Promise.resolve({
        data: requestedPage === 2
          ? listPage([], { count: 0, totalPages: 1, currentPage: 1 })
          : listPage([pmA], { count: 20, totalPages: 2, currentPage: 1 }),
      });
    });
    render(<PreventiveMaintenanceListPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    getMock.mockClear();

    act(() => useFilterStore.getState().setPage(2));

    await waitFor(() => expect(useFilterStore.getState().page).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [],
      totalCount: 0,
      filterParams: { page: 1, page_size: 10 },
    });
  });

  it("settles a non-empty out-of-range response on the last page once", async () => {
    const getMock = vi.spyOn(apiClient, "get").mockImplementation((_url, config) => {
      const requestedPage = (config?.params as { page?: number } | undefined)?.page ?? 1;
      return Promise.resolve({
        data: requestedPage === 4
          ? listPage([pmB], { count: 20, totalPages: 2, currentPage: 2 })
          : listPage([pmA], { count: 40, totalPages: 4, currentPage: 1 }),
      });
    });
    render(<PreventiveMaintenanceListPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    getMock.mockClear();

    act(() => useFilterStore.getState().setPage(4));

    await waitFor(() => expect(useFilterStore.getState().page).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(usePreventiveMaintenanceStore.getState()).toMatchObject({
      maintenanceItems: [pmB],
      totalCount: 20,
      filterParams: { page: 2, page_size: 10 },
    });
  });
});
