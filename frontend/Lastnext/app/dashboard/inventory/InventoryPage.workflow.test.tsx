import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "./page";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  selectedProperty: "PROPERTY-A",
  itemsByProperty: {} as Record<string, InventoryFixture>,
  completeCsvImport: undefined as undefined | (() => void),
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
  useUser: () => ({
    selectedPropertyId: mocks.selectedProperty,
    userProfile: {
      id: 5005,
      profile_id: 5005,
      user_id: 4004,
      properties: [
        { id: 1001, property_id: "PROPERTY-A", name: "Hotel A" },
        { id: 2002, property_id: "PROPERTY-B", name: "Hotel B" },
      ],
    },
  }),
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
  InventoryCsvImport: ({ onImported }: { onImported?: () => void }) => {
    mocks.completeCsvImport = onImported;
    return <button onClick={onImported}>Complete CSV import</button>;
  },
}));

vi.mock("@/app/components/inventory/InventoryMobileStats", () => ({
  InventoryMobileStats: () => <span>Inventory summary</span>,
}));

function inventoryListCalls() {
  return mocks.apiGet.mock.calls.filter(([url]) => url === "/api/v1/inventory/");
}

async function renderInventory() {
  const view = render(<InventoryPage />);
  await screen.findByText("Chiller belt");
  await waitFor(() => expect(inventoryListCalls().length).toBeGreaterThan(0));
  return view;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createdItem(name = "Server Normalized Filter") {
  return {
    ...inventoryItem("PROPERTY-A", 6, "INV-3003"),
    id: 3003,
    name,
    description: "HVAC filter",
    property: 1001,
  };
}

function openAndFillAddItem(name = "New filter") {
  fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
  fireEvent.change(screen.getByLabelText("Item Name *"), { target: { value: name } });
  fireEvent.click(screen.getByText("Select category"));
  fireEvent.click(screen.getByRole("option", { name: "Parts" }));
  fireEvent.change(screen.getByLabelText("Initial Quantity *"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Min Quantity"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "HVAC filter" } });
  fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Shelf 9" } });
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
  mocks.completeCsvImport = undefined;
  vi.stubGlobal("alert", mocks.alert);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("InventoryPage mutation and reconciliation workflows", () => {
  it("creates once for canonical Property A and reconciles server-normalized data", async () => {
    const createRequest = deferred<{ data: ReturnType<typeof createdItem> }>();
    mocks.apiPost.mockReturnValue(createRequest.promise);
    await renderInventory();
    const initialListCalls = inventoryListCalls().length;
    openAndFillAddItem();

    const submit = screen.getByRole("button", { name: "Add Item" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/v1/inventory/",
      {
        name: "New filter",
        category: "parts",
        description: "HVAC filter",
        quantity: 6,
        min_quantity: 2,
        unit: "pcs",
        location: "Shelf 9",
        property: 1001,
      },
      { skipAutomaticRetry: true },
    );
    expect(screen.getByRole("dialog", { name: "Add New Inventory Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    expect(inventoryListCalls()).toHaveLength(initialListCalls);

    const authoritativeItem = createdItem();
    mocks.apiGet.mockImplementation((url: string, config?: { params?: { property_id?: string } }) => {
      if (url === "/api/v1/inventory/" && config?.params?.property_id === "PROPERTY-A") {
        return Promise.resolve({
          data: {
            ...listResponse(mocks.itemsByProperty["PROPERTY-A"]),
            count: 2,
            results: [authoritativeItem, mocks.itemsByProperty["PROPERTY-A"]],
          },
        });
      }
      return apiGetResponse(url, config);
    });
    await act(async () => createRequest.resolve({ data: authoritativeItem }));

    await screen.findByText("Server Normalized Filter");
    expect(screen.getAllByText("Server Normalized Filter")).toHaveLength(1);
    expect(screen.getByText("Chiller belt")).toBeInTheDocument();
    expect(inventoryListCalls()).toHaveLength(initialListCalls + 1);
    expect(screen.queryByRole("dialog", { name: "Add New Inventory Item" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(screen.getByLabelText("Item Name *")).toHaveValue("");
  });

  it("validates locally and prevents a stale open form from rebinding to Property B", async () => {
    const view = await renderInventory();
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Item name is required.");
    expect(mocks.apiPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Item Name *"), { target: { value: "Property A draft" } });
    mocks.selectedProperty = "PROPERTY-B";
    view.rerender(<InventoryPage />);
    await screen.findByText("Foreign pump seal");
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Property changed. Close and reopen Add Item to continue.",
    );
    expect(screen.getByLabelText("Item Name *")).toHaveValue("Property A draft");
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it.each([
    ["400", { response: { status: 400, data: { name: ["Already exists."] } } }, "Already exists."],
    ["403", { response: { status: 403, data: { detail: "Property is forbidden." } } }, "Property is forbidden."],
    ["network", new Error("Network unavailable"), "Network unavailable"],
  ])("preserves the form after a %s create failure", async (_kind, failure, message) => {
    mocks.apiPost.mockRejectedValueOnce(failure);
    await renderInventory();
    openAndFillAddItem("Recoverable draft");
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog", { name: "Add New Inventory Item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Item Name *")).toHaveValue("Recoverable draft");
    expect(screen.getByRole("button", { name: "Add Item" })).toBeEnabled();
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Chiller belt")).toBeInTheDocument();
  });

  it("does not reconcile a late Property A success into Property B", async () => {
    const createRequest = deferred<{ data: ReturnType<typeof createdItem> }>();
    mocks.apiPost.mockReturnValue(createRequest.promise);
    const view = await renderInventory();
    openAndFillAddItem();
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));

    mocks.selectedProperty = "PROPERTY-B";
    view.rerender(<InventoryPage />);
    await screen.findByText("Foreign pump seal");
    const propertyAListCalls = inventoryListCalls().filter(([, config]) =>
      config?.params?.property_id === "PROPERTY-A",
    ).length;
    await act(async () => createRequest.resolve({ data: createdItem() }));

    expect(screen.getByText("Foreign pump seal")).toBeInTheDocument();
    expect(screen.queryByText("Server Normalized Filter")).not.toBeInTheDocument();
    expect(inventoryListCalls().filter(([, config]) =>
      config?.params?.property_id === "PROPERTY-A",
    )).toHaveLength(propertyAListCalls);
    expect(screen.getByRole("dialog", { name: "Add New Inventory Item" })).toBeInTheDocument();
  });

  it("allows an intentional retry after failure and creates no automatic duplicate", async () => {
    mocks.apiPost
      .mockRejectedValueOnce({ response: { status: 500, data: { detail: "Try again." } } })
      .mockResolvedValueOnce({ data: createdItem() });
    await renderInventory();
    openAndFillAddItem("Retry draft");
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again.");
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2));
    expect(mocks.apiPost.mock.calls[0][2]).toEqual({ skipAutomaticRetry: true });
    expect(mocks.apiPost.mock.calls[1][2]).toEqual({ skipAutomaticRetry: true });
  });

  it("ignores a create response after unmount", async () => {
    const createRequest = deferred<{ data: ReturnType<typeof createdItem> }>();
    mocks.apiPost.mockReturnValue(createRequest.promise);
    const view = await renderInventory();
    openAndFillAddItem();
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    const initialListCalls = inventoryListCalls().length;
    view.unmount();

    await act(async () => createRequest.resolve({ data: createdItem() }));
    expect(inventoryListCalls()).toHaveLength(initialListCalls);
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
  });

  it("refetches page one after a successful CSV import", async () => {
    await renderInventory();
    const initialListCalls = inventoryListCalls().length;

    fireEvent.click(screen.getByRole("button", { name: "Complete CSV import" }));

    await waitFor(() => {
      expect(inventoryListCalls()).toHaveLength(initialListCalls + 1);
    });
  });

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
