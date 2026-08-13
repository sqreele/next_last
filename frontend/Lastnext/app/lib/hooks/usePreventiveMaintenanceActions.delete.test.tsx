import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/app/lib/api-client";
import apiClient from "@/app/lib/api-client";
import type { PMListItem } from "@/app/lib/api/pm-contracts";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import { usePreventiveMaintenanceStore } from "@/app/lib/stores/usePreventiveMaintenanceStore";
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
  seed();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("active PM list delete workflow", () => {
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
