import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "./page";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  selectedProperty: "PROPERTY-A",
  itemsByProperty: {} as Record<string, InventoryFixture>,
}));

interface InventoryFixture {
  id: number;
  item_id: string;
  name: string;
  category: "parts";
  category_display: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  status: "available" | "low_stock";
  status_display: string;
  property_id: string;
  property_name: string;
  room_name: string;
  location: string;
  job_id: null;
  job_description: null;
  pm_id: null;
  pm_title: null;
  job_ids: string[];
  pm_ids: string[];
  jobs_detail: [];
  preventive_maintenances_detail: [];
  image_url: null;
  last_job_by_user: null;
  last_pm_by_user: null;
  created_at: string;
  updated_at: string;
}

function inventoryItem(
  propertyId: string,
  quantity = 5,
  itemId = "INV-A-17",
): InventoryFixture {
  return {
    id: propertyId === "PROPERTY-A" ? 17 : 88,
    item_id: itemId,
    name: propertyId === "PROPERTY-A" ? "Chiller belt" : "Foreign pump seal",
    category: "parts",
    category_display: "Parts",
    quantity,
    min_quantity: 2,
    unit: "pcs",
    status: quantity < 2 ? "low_stock" : "available",
    status_display: quantity < 2 ? "Low Stock" : "Available",
    property_id: propertyId,
    property_name: propertyId === "PROPERTY-A" ? "Hotel A" : "Hotel B",
    room_name: "Engineering store",
    location: "Shelf 4",
    job_id: null,
    job_description: null,
    pm_id: null,
    pm_title: null,
    job_ids: [],
    pm_ids: [],
    jobs_detail: [],
    preventive_maintenances_detail: [],
    image_url: null,
    last_job_by_user: null,
    last_pm_by_user: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z",
  };
}

function listResponse(item: InventoryFixture) {
  return {
    count: 1,
    next: null,
    previous: null,
    total_pages: 1,
    current_page: 1,
    page_size: 12,
    results: [item],
  };
}

function apiGetResponse(url: string, config?: { params?: { property_id?: string } }) {
  if (url === "/api/v1/inventory/") {
    const propertyId = config?.params?.property_id ?? mocks.selectedProperty;
    return Promise.resolve({ data: listResponse(mocks.itemsByProperty[propertyId]) });
  }
  if (url === "/api/v1/inventory/filter_options/") {
    return Promise.resolve({
      data: {
        categories: [{ value: "parts", label: "Parts" }],
        statuses: [{ value: "available", label: "Available" }],
      },
    });
  }
  if (url === "/api/v1/jobs/my_jobs/") {
    return Promise.resolve({ data: { results: [] } });
  }
  return Promise.resolve({ data: { results: [] } });
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { accessToken: "token-a" } },
  }),
}));

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({ selectedPropertyId: mocks.selectedProperty }),
}));

vi.mock("@/app/lib/api-client", () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}));

vi.mock("@/app/lib/hooks/useMinLoaderTime", async () => {
  const React = await import("react");
  return {
    useMinLoaderTime: (setLoading: (loading: boolean) => void) => ({
      recordLoaderShown: React.useCallback(() => undefined, []),
      clearLoadingAfterMinTime: React.useCallback(
        () => setLoading(false),
        [setLoading],
      ),
    }),
  };
});

vi.mock("@/app/lib/i18n/LocaleProvider", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/app/components/inventory/InventoryCsvImport", () => ({
  InventoryCsvImport: () => <span>CSV import</span>,
}));

vi.mock("@/app/components/inventory/InventoryMobileStats", () => ({
  InventoryMobileStats: () => <span>Inventory summary</span>,
}));

function inventoryListCalls() {
  return mocks.apiGet.mock.calls.filter(([url]) => url === "/api/v1/inventory/");
}

async function renderInventory() {
  render(<InventoryPage />);
  await screen.findByText("Chiller belt");
  await waitFor(() => expect(inventoryListCalls().length).toBeGreaterThan(0));
}

function openUseDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Use" }));
  return screen.getByLabelText("Quantity to use");
}

function openRestockDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Restock" }));
  return screen.getByLabelText("Quantity to Add");
}

beforeEach(() => {
  mocks.selectedProperty = "PROPERTY-A";
  mocks.itemsByProperty = {
    "PROPERTY-A": inventoryItem("PROPERTY-A"),
    "PROPERTY-B": inventoryItem("PROPERTY-B", 11, "INV-B-88"),
  };
  mocks.push.mockReset();
  mocks.alert.mockReset();
  mocks.apiGet.mockReset().mockImplementation(apiGetResponse);
  mocks.apiPost.mockReset();
  vi.stubGlobal("alert", mocks.alert);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("InventoryPage use and restock workflows", () => {
  it("uses the exact item once and reconciles balance from the authoritative list", async () => {
    await renderInventory();
    const quantity = openUseDialog();
    fireEvent.change(quantity, { target: { value: "2" } });

    let resolveUse!: (value: { data: InventoryFixture }) => void;
    mocks.apiPost.mockImplementationOnce(
      () => new Promise((resolve) => { resolveUse = resolve; }),
    );
    const submit = screen.getByRole("button", { name: "Use" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/v1/inventory/INV-A-17/use/",
      { quantity: 2 },
    );
    expect(inventoryListCalls()).toHaveLength(1);
    expect(screen.getByText("5 pcs")).toBeInTheDocument();

    mocks.itemsByProperty["PROPERTY-A"] = inventoryItem("PROPERTY-A", 3);
    resolveUse({ data: mocks.itemsByProperty["PROPERTY-A"] });

    await waitFor(() => expect(inventoryListCalls()).toHaveLength(2));
    await screen.findByText("3 pcs");
    expect(screen.queryByRole("dialog", { name: "Use Item" })).not.toBeInTheDocument();
  });

  it("restocks the exact item once and reconciles the returned balance by refetch", async () => {
    await renderInventory();
    const quantity = openRestockDialog();
    fireEvent.change(quantity, { target: { value: "4" } });

    let resolveRestock!: (value: { data: InventoryFixture }) => void;
    mocks.apiPost.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRestock = resolve; }),
    );
    const submit = screen.getByRole("button", { name: "Restock" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/v1/inventory/INV-A-17/restock/",
      { quantity: 4 },
    );
    expect(inventoryListCalls()).toHaveLength(1);

    mocks.itemsByProperty["PROPERTY-A"] = inventoryItem("PROPERTY-A", 9);
    resolveRestock({ data: mocks.itemsByProperty["PROPERTY-A"] });

    await waitFor(() => expect(inventoryListCalls()).toHaveLength(2));
    await screen.findByText("9 pcs");
  });

  it("blocks zero, negative, decimal, and overdraw quantities before mutation", async () => {
    await renderInventory();
    const useQuantity = openUseDialog();
    const useSubmit = screen.getByRole("button", { name: "Use" });

    for (const value of ["0", "-1", "1.5", "6"]) {
      fireEvent.change(useQuantity, { target: { value } });
      expect(useSubmit).toBeDisabled();
    }
    expect(mocks.apiPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const restockQuantity = openRestockDialog();
    const restockSubmit = screen.getByRole("button", { name: "Restock" });
    for (const value of ["0", "-1", "1.5"]) {
      fireEvent.change(restockQuantity, { target: { value } });
      expect(restockSubmit).toBeDisabled();
    }
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it("retains the selected item identity when active property changes", async () => {
    const view = render(<InventoryPage />);
    await screen.findByText("Chiller belt");
    const quantity = openUseDialog();
    fireEvent.change(quantity, { target: { value: "1" } });

    mocks.selectedProperty = "PROPERTY-B";
    view.rerender(<InventoryPage />);
    await waitFor(() => {
      expect(inventoryListCalls().some(([, config]) =>
        config?.params?.property_id === "PROPERTY-B",
      )).toBe(true);
    });
    mocks.apiPost.mockResolvedValueOnce({ data: inventoryItem("PROPERTY-A", 4) });
    fireEvent.click(screen.getByRole("button", { name: "Use" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/v1/inventory/INV-A-17/use/",
      { quantity: 1 },
    );
    expect(mocks.apiPost.mock.calls[0][1]).not.toHaveProperty("property_id");
    expect(mocks.apiPost.mock.calls[0][0]).not.toContain("INV-B-88");
  });

  it("keeps use recoverable without false balance/history reconciliation on conflict", async () => {
    await renderInventory();
    const initialListCalls = inventoryListCalls().length;
    const quantity = openUseDialog();
    fireEvent.change(quantity, { target: { value: "5" } });
    mocks.apiPost.mockRejectedValueOnce({
      response: { status: 409, data: { error: "Stock changed; only 3 remain." } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Use" }));

    await waitFor(() => {
      expect(mocks.alert).toHaveBeenCalledWith("Stock changed; only 3 remain.");
    });
    expect(inventoryListCalls()).toHaveLength(initialListCalls);
    expect(screen.getByText("5 pcs")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Use Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use" })).toBeEnabled();
  });

  it("keeps restock recoverable and unchanged after authorization failure", async () => {
    await renderInventory();
    const initialListCalls = inventoryListCalls().length;
    const quantity = openRestockDialog();
    fireEvent.change(quantity, { target: { value: "3" } });
    mocks.apiPost.mockRejectedValueOnce({
      response: { status: 403, data: { error: "You cannot restock this item." } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Restock" }));

    await waitFor(() => {
      expect(mocks.alert).toHaveBeenCalledWith("You cannot restock this item.");
    });
    expect(inventoryListCalls()).toHaveLength(initialListCalls);
    expect(screen.getByText("5 pcs")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Restock Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restock" })).toBeEnabled();
  });
});
