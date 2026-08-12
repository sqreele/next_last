import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditPreventiveMaintenancePage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  search: "",
  listeners: new Set<() => void>(),
  storeState: {} as Record<string, unknown>,
  resetStore: null as unknown as () => void,
}));

const machine = {
  id: 11,
  machine_id: "MACHINE-A",
  name: "Chiller A",
  brand: null,
  category: "HVAC",
  serial_number: null,
  description: null,
  location: "Plant room",
  property: 7,
  property_name: "Hotel A",
  status: "active",
  group_id: null,
  installation_date: null,
  last_maintenance_date: null,
  task_count: 0,
  purchase_date: null,
  purchase_cost: null,
  warranty_start_date: null,
  warranty_end_date: null,
  expected_replacement_date: null,
  replacement_cost_estimate: null,
  supplier: null,
  supplier_contact: null,
  asset_tag: null,
  lifecycle_notes: null,
  lifecycle_state: "active",
  is_under_warranty: false,
  image: null,
  image_url: null,
  created_at: "2026-08-01T00:00:00",
  updated_at: "2026-08-02T00:00:00",
};

const pmDetail = {
  pm_id: "PM-17",
  job: null,
  pmtitle: "Inspect chiller bearings",
  topics: [{ id: 3, title: "HVAC", description: null }],
  scheduled_date: "2026-09-15T10:30:00",
  completed_date: null,
  frequency: "custom",
  custom_days: 14,
  next_due_date: "2026-09-29T10:30:00",
  before_image: null,
  after_image: null,
  before_image_url: null,
  after_image_url: null,
  notes: "Check vibration",
  procedure: null,
  procedure_template: 501,
  procedure_template_id: 501,
  procedure_template_name: "Bearing inspection",
  created_by: null,
  updated_at: "2026-08-02T00:00:00",
  is_overdue: false,
  days_remaining: 35,
  machines: [machine],
  property_id: "PROPERTY-A",
  assigned_to: 41,
  assigned_to_details: null,
  created_by_details: null,
  assigned_to_name: "Engineer A",
  technician_name: "Engineer A",
  created_by_name: "Engineer A",
  master_plan: 9,
  occurrence_due_date: "2026-09-15T10:30:00",
  generated_at: "2026-09-01T00:00:00",
};

const procedures = [
  {
    id: 501,
    name: "Bearing inspection",
    group_id: null,
    category: "HVAC",
    frequency: "custom",
    estimated_duration: "01:00:00",
    responsible_department: "Engineering",
    difficulty_level: "intermediate",
    schedule_count: 1,
    machine_ids: ["MACHINE-A"],
    machines: [],
    created_at: "2026-08-01T00:00:00",
  },
  {
    id: 502,
    name: "Compressor inspection",
    group_id: null,
    category: "HVAC",
    frequency: "monthly",
    estimated_duration: "02:00:00",
    responsible_department: "Engineering",
    difficulty_level: "advanced",
    schedule_count: 0,
    machine_ids: ["MACHINE-A"],
    machines: [],
    created_at: "2026-08-03T00:00:00",
  },
];

const writeResponse = {
  ...pmDetail,
  pmtitle: "Inspect compressor and bearings",
  scheduled_date: "2026-10-20T14:45",
  procedure_template: 502,
  procedure_template_id: 502,
};

const listResponse = {
  count: 1,
  next: null,
  previous: null,
  total_pages: 1,
  current_page: 1,
  page_size: 20,
  results: [],
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useParams: () => ({ pm_id: "PM-17" }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: { user: { accessToken: "token-a" } },
    status: "authenticated",
  }),
}));

vi.mock("@/app/lib/stores/useAuthStore", () => ({
  useAuthStore: () => ({ selectedProperty: "PROPERTY-A" }),
}));

vi.mock("@/app/lib/stores/usePreventiveMaintenanceStore", async () => {
  const React = await import("react");
  const update = (patch: Record<string, unknown>) => {
    mocks.storeState = { ...mocks.storeState, ...patch };
    mocks.listeners.forEach((listener) => listener());
  };
  const actions = {
    setMaintenanceItems: (maintenanceItems: unknown[]) => update({ maintenanceItems }),
    setTopics: (topics: unknown[]) => update({ topics }),
    setMachines: (machines: unknown[]) => update({ machines }),
    setStatistics: (statistics: unknown) => update({ statistics }),
    setSelectedMaintenance: (selectedMaintenance: unknown) => update({ selectedMaintenance }),
    setTotalCount: (totalCount: number) => update({ totalCount }),
    setLoading: (isLoading: boolean) => update({ isLoading }),
    setError: (error: string | null) => update({ error }),
    setFilterParams: (filterParams: Record<string, unknown>) =>
      update({ filterParams: { ...(mocks.storeState.filterParams as object), ...filterParams } }),
    clearError: () => update({ error: null }),
  };
  mocks.resetStore = () => {
    mocks.storeState = {
      maintenanceItems: [],
      topics: [],
      machines: [],
      statistics: null,
      selectedMaintenance: null,
      totalCount: 0,
      isLoading: false,
      error: null,
      filterParams: { page: 1, page_size: 20 },
      ...actions,
    };
  };
  mocks.resetStore();
  return {
    usePreventiveMaintenanceStore: () => React.useSyncExternalStore(
      (listener) => {
        mocks.listeners.add(listener);
        return () => mocks.listeners.delete(listener);
      },
      () => mocks.storeState,
      () => mocks.storeState,
    ),
  };
});

vi.mock("@/app/lib/api-client", () => ({
  default: {
    get: mocks.apiGet,
    put: mocks.apiPut,
    post: mocks.apiPost,
  },
  handleApiError: (error: unknown) => error,
}));

vi.mock("@/app/components/ui/UniversalImage", () => ({
  PreviewImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("@/app/lib/utils/image-utils", () => ({
  fixImageUrl: (url: string) => url,
}));

function apiGetResponse(url: string) {
  if (url === "/api/v1/preventive-maintenance/PM-17/") {
    return Promise.resolve({ data: pmDetail });
  }
  if (url === "/api/v1/maintenance-procedures/") {
    return Promise.resolve({ data: listResponseWithProcedures() });
  }
  if (url === "/api/v1/preventive-maintenance") {
    return Promise.resolve({ data: listResponse });
  }
  return Promise.resolve({ data: listResponse });
}

function listResponseWithProcedures() {
  return { ...listResponse, count: procedures.length, results: procedures };
}

async function renderHydratedEdit() {
  render(<EditPreventiveMaintenancePage />);
  await screen.findByRole("heading", { name: "Edit Maintenance" });
  await waitFor(() => expect(screen.getByPlaceholderText("Enter maintenance title")).toHaveValue(
    "Inspect chiller bearings",
  ));
}

function dateInputs() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'));
}

beforeEach(() => {
  mocks.resetStore();
  mocks.search = "";
  mocks.push.mockReset();
  mocks.apiGet.mockReset().mockImplementation(apiGetResponse);
  mocks.apiPut.mockReset().mockResolvedValue({ data: writeResponse });
  mocks.apiPost.mockReset();
});

afterEach(() => {
  cleanup();
  mocks.listeners.clear();
  vi.clearAllMocks();
});

describe("EditPreventiveMaintenancePage workflow", () => {
  it("hydrates canonical detail and sends one exact multipart PUT", async () => {
    await renderHydratedEdit();
    expect(dateInputs()[0]).toHaveValue("2026-09-15T10:30");
    expect(dateInputs()[1]).toHaveValue("");
    expect(screen.getByRole("combobox")).toHaveValue("501");
    expect(screen.getByPlaceholderText("Enter maintenance notes...")).toHaveValue("Check vibration");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Enter maintenance title"), {
      target: { value: "Inspect compressor and bearings" },
    });
    fireEvent.change(dateInputs()[0], { target: { value: "2026-10-20T14:45" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "502" } });
    fireEvent.change(screen.getByPlaceholderText("Enter maintenance notes..."), {
      target: { value: "  Check oil and vibration  " },
    });

    let resolvePut!: (value: { data: typeof writeResponse }) => void;
    mocks.apiPut.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePut = resolve; }),
    );
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1));
    const [url, body, config] = mocks.apiPut.mock.calls[0] as [string, FormData, object];
    expect(url).toBe("/api/v1/preventive-maintenance/PM-17/");
    expect(config).toEqual({
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: "Bearer token-a",
      },
    });
    expect(Object.fromEntries(body.entries())).toEqual({
      pmtitle: "Inspect compressor and bearings",
      scheduled_date: "2026-10-20T14:45",
      frequency: "custom",
      custom_days: "14",
      notes: "Check oil and vibration",
      procedure_template: "502",
      topic_ids: "3",
      machine_ids: "MACHINE-A",
    });
    expect(body.has("property_id")).toBe(false);
    expect(body.has("assigned_to")).toBe(false);
    expect(body.has("completed_date")).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();

    resolvePut({ data: writeResponse });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/preventive-maintenance/PM-17");
    });
  });

  it("shows update failure, preserves form state, and never navigates", async () => {
    await renderHydratedEdit();
    fireEvent.change(screen.getByPlaceholderText("Enter maintenance title"), {
      target: { value: "Unsaved compressor change" },
    });
    mocks.apiPut.mockRejectedValueOnce({
      message: "Request failed",
      response: { status: 403, data: { detail: "You cannot update this PM." } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText("You cannot update this PM.");
    expect(screen.getByPlaceholderText("Enter maintenance title")).toHaveValue(
      "Unsaved compressor change",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("submits completion date and after-image atomically from the generated work form", async () => {
    mocks.search = "complete=true";
    await renderHydratedEdit();
    const afterImage = new File(["after"], "completed.jpg", { type: "image/jpeg" });
    const inputs = dateInputs();
    await waitFor(() => expect(inputs[1].value).not.toBe(""));
    fireEvent.change(inputs[1], { target: { value: "2026-08-12T04:05" } });
    const fileInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );
    fireEvent.change(fileInputs[1], { target: { files: [afterImage] } });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "After maintenance" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1));
    const [url, body] = mocks.apiPut.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/v1/preventive-maintenance/PM-17/");
    expect(body.get("completed_date")).toBe("2026-08-12T04:05");
    expect(body.get("after_image")).toBe(afterImage);
    expect(body.has("property_id")).toBe(false);
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/preventive-maintenance/PM-17");
    });
  });

  it("keeps after-image evidence unsaved when the atomic work-form update fails", async () => {
    mocks.search = "complete=true";
    await renderHydratedEdit();
    const afterImage = new File(["after"], "failed-completion.jpg", {
      type: "image/jpeg",
    });
    const fileInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );
    fireEvent.change(fileInputs[1], { target: { files: [afterImage] } });
    await screen.findByRole("img", { name: "After maintenance" });
    mocks.apiPut.mockRejectedValueOnce({
      message: "Request failed",
      response: { status: 403, data: { detail: "Completion evidence was not saved." } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText("Completion evidence was not saved.");
    expect(mocks.apiPut).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "After maintenance" })).toBeInTheDocument();
  });
});
