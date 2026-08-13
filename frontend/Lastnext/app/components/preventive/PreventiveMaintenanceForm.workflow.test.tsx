import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreatePreventiveMaintenancePage from "@/app/dashboard/preventive-maintenance/create/page";

const mocks = vi.hoisted(() => ({
  propertyId: "PROPERTY-A",
  push: vi.fn(),
  createMasterPlan: vi.fn(),
  createMaintenance: vi.fn(),
  getMachines: vi.fn(),
  fetchProcedures: vi.fn(),
  apiGet: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const properties = [
  { id: 7, property_id: "PROPERTY-A", name: "Hotel A" },
  { id: 8, property_id: "PROPERTY-B", name: "Hotel B" },
];

const machinesA = [{
  id: 11,
  machine_id: "MACHINE-A",
  name: "Chiller A",
  status: "active",
}];

const machinesB = [{
  id: 22,
  machine_id: "MACHINE-B",
  name: "Chiller B",
  status: "active",
}];

const proceduresA = [
  {
    id: 501,
    property_id: "PROPERTY-A",
    name: "Weekly chiller inspection",
    group_id: null,
    category: "HVAC",
    frequency: "weekly",
    estimated_duration: "01:00:00",
    responsible_department: "Engineering",
    difficulty_level: "intermediate",
    schedule_count: 0,
    machine_ids: ["MACHINE-A"],
    machines: [],
    created_at: "2026-08-01T00:00:00Z",
  },
];

const proceduresB = [{
  ...proceduresA[0],
  id: 502,
  property_id: "PROPERTY-B",
  name: "Monthly chiller B inspection",
  frequency: "monthly",
  machine_ids: ["MACHINE-B"],
}];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/lib/auth0", () => ({
  useClientAuth0: () => ({ accessToken: "token-a" }),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    data: { user: { accessToken: "token-a" } },
    status: "authenticated",
  }),
}));

vi.mock("@/app/lib/stores/mainStore", () => ({
  useProperties: () => ({ properties }),
  useUser: () => ({
    selectedPropertyId: mocks.propertyId,
    setSelectedPropertyId: (propertyId: string) => { mocks.propertyId = propertyId; },
    userProfile: { id: 1041, profile_id: 1041, user_id: 41, properties },
  }),
}));

vi.mock("@/app/lib/hooks/use-toast", () => ({
  useToast: () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
  }),
}));

vi.mock("@/app/lib/PreventiveMaintenanceService", () => ({
  preventiveMaintenanceService: {
    createPMMasterPlan: mocks.createMasterPlan,
    createPreventiveMaintenance: mocks.createMaintenance,
  },
  setPreventiveMaintenanceServiceToken: vi.fn(),
}));

vi.mock("@/app/lib/MachineService", () => ({
  default: class MachineService {
    getMachines = mocks.getMachines;
  },
}));

vi.mock("@/app/lib/TopicService", () => ({
  default: class TopicService {
    getTopics = vi.fn().mockResolvedValue({ success: true, data: [] });
  },
}));

vi.mock("@/app/lib/maintenanceProcedures", () => ({
  fetchAllMaintenanceProcedures: mocks.fetchProcedures,
}));

vi.mock("@/app/lib/api-client", () => ({
  default: { get: mocks.apiGet },
}));

vi.mock("@/app/components/jobs/FileUpload", () => ({
  default: ({ onFileSelect, disabled }: {
    onFileSelect: (files: File[]) => void;
    disabled?: boolean;
  }) => (
    <input
      aria-label="PM image upload"
      type="file"
      disabled={disabled}
      onChange={(event) => onFileSelect(Array.from(event.target.files ?? []))}
    />
  ),
}));

vi.mock("@/app/components/ui/UniversalImage", () => ({
  PreviewImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

async function renderReadyCreate() {
  const view = render(<CreatePreventiveMaintenancePage />);
  await screen.findByRole("form", { name: "Preventive Maintenance Form" });
  await waitFor(() => {
    expect(screen.getByRole("option", { name: /Weekly chiller inspection/ })).toBeInTheDocument();
  });
  return view;
}

async function selectTemplateAndMachine(machineName: string, taskId = 501) {
  fireEvent.change(screen.getByLabelText(/Maintenance Task Template/), {
    target: { value: String(taskId) },
  });
  const machine = await screen.findByRole("checkbox", { name: new RegExp(machineName) });
  fireEvent.click(machine);
}

function setScheduledDate(value: string) {
  fireEvent.change(screen.getByLabelText(/Scheduled Date & Time/), {
    target: { value },
  });
}

beforeEach(() => {
  mocks.propertyId = "PROPERTY-A";
  mocks.push.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.createMaintenance.mockReset();
  mocks.createMasterPlan.mockReset().mockResolvedValue({
    success: true,
    data: {
      plan_id: "PLAN-9",
      title: "Weekly chiller inspection",
      start_date: "2026-09-10T09:30",
      frequency: "weekly",
      lead_time_days: 7,
      active: true,
    },
  });
  mocks.getMachines.mockReset().mockImplementation((propertyId: string) =>
    Promise.resolve({
      success: true,
      data: propertyId === "PROPERTY-B" ? machinesB : machinesA,
    }),
  );
  mocks.fetchProcedures.mockReset().mockImplementation(({ propertyId }: { propertyId?: string }) =>
    Promise.resolve(propertyId === "PROPERTY-B" ? proceduresB : proceduresA),
  );
  mocks.apiGet.mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PreventiveMaintenanceForm create workflow", () => {
  it("submits one exact recurring-plan payload and navigates after success", async () => {
    await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");
    setScheduledDate("2026-09-10T09:30");
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "  Check filters and pressure  " },
    });

    const submit = screen.getByRole("button", { name: "Create Maintenance" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.createMasterPlan).toHaveBeenCalledTimes(1));
    expect(mocks.createMasterPlan).toHaveBeenCalledWith({
      title: "Weekly chiller inspection",
      property_id: "PROPERTY-A",
      machine_ids: ["MACHINE-A"],
      topic_ids: [],
      start_date: "2026-09-10T09:30",
      frequency: "weekly",
      custom_days: undefined,
      lead_time_days: 7,
      procedure_template: 501,
      assigned_to: 41,
      notes: "Check filters and pressure",
      procedure: "",
      remarks: undefined,
      active: true,
    });
    expect(mocks.createMaintenance).not.toHaveBeenCalled();
    await screen.findByText("Preventive maintenance created successfully! Redirecting...");
    await waitFor(
      () => expect(mocks.push).toHaveBeenCalledWith("/dashboard/preventive-maintenance/PLAN-9"),
      { timeout: 2500 },
    );
  });

  it("remounts on Property change and submits only the new property's Machine", async () => {
    const view = await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");

    mocks.propertyId = "PROPERTY-B";
    view.rerender(<CreatePreventiveMaintenancePage />);

    await waitFor(() => expect(mocks.getMachines).toHaveBeenCalledWith("PROPERTY-B", "token-a"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Monthly chiller B inspection/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("option", { name: /Weekly chiller inspection/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Maintenance Task Template/)).toHaveValue("");
    expect(screen.queryByRole("checkbox", { name: /Chiller A/ })).not.toBeInTheDocument();
    await selectTemplateAndMachine("Chiller B", 502);
    setScheduledDate("2026-09-20T11:45");
    fireEvent.change(screen.getByLabelText("Maintenance Frequency"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Custom Days Interval"), {
      target: { value: "14" },
    });
    mocks.createMasterPlan.mockImplementationOnce(() => new Promise(() => undefined));

    fireEvent.click(screen.getByRole("button", { name: "Create Maintenance" }));

    await waitFor(() => expect(mocks.createMasterPlan).toHaveBeenCalledTimes(1));
    expect(mocks.createMasterPlan.mock.calls[0][0]).toEqual(expect.objectContaining({
      machine_ids: ["MACHINE-B"],
      property_id: "PROPERTY-B",
      start_date: "2026-09-20T11:45",
      frequency: "custom",
      custom_days: 14,
      procedure_template: 502,
    }));
    expect(mocks.createMasterPlan.mock.calls[0][0].machine_ids).not.toContain("MACHINE-A");
  });

  it("omits stale custom days after changing back to a standard schedule", async () => {
    await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");
    setScheduledDate("2026-10-01T08:15");
    fireEvent.change(screen.getByLabelText("Maintenance Frequency"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Custom Days Interval"), {
      target: { value: "21" },
    });
    fireEvent.change(screen.getByLabelText("Maintenance Frequency"), {
      target: { value: "monthly" },
    });
    mocks.createMasterPlan.mockImplementationOnce(() => new Promise(() => undefined));

    fireEvent.click(screen.getByRole("button", { name: "Create Maintenance" }));

    await waitFor(() => expect(mocks.createMasterPlan).toHaveBeenCalledTimes(1));
    expect(mocks.createMasterPlan.mock.calls[0][0]).toEqual(expect.objectContaining({
      frequency: "monthly",
      custom_days: undefined,
    }));
  });

  it("does not mutate when required fields are missing", async () => {
    await renderReadyCreate();
    fireEvent.click(screen.getByRole("button", { name: "Create Maintenance" }));

    await screen.findByText("Title is required");
    await screen.findByText("Maintenance Task Template is required");
    expect(mocks.createMasterPlan).not.toHaveBeenCalled();
    expect(mocks.createMaintenance).not.toHaveBeenCalled();
  });

  it("keeps the form usable and does not navigate after a create failure", async () => {
    await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");
    setScheduledDate("2026-09-10T09:30");
    mocks.createMasterPlan.mockRejectedValueOnce({
      message: "Request failed",
      response: { status: 403, data: { detail: "You cannot create this PM plan." } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Maintenance" }));

    await screen.findByText("You cannot create this PM plan.");
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/Maintenance Title/)).toBeEnabled());
    expect(screen.getByLabelText(/Maintenance Task Template/)).toHaveValue("501");
    expect(screen.getByRole("checkbox", { name: /Chiller A/ })).toBeChecked();
  });

  it("fails closed without a selected property and never requests global procedures", async () => {
    mocks.propertyId = "";
    render(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("form", { name: "Preventive Maintenance Form" });

    expect(mocks.fetchProcedures).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /chiller inspection/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Maintenance Task Template/)).toBeDisabled();
  });

  it("ignores a late Property A procedure response after switching to Property B", async () => {
    const pendingA: Array<(value: typeof proceduresA) => void> = [];
    mocks.fetchProcedures.mockImplementation(({ propertyId }: { propertyId?: string }) => {
      if (propertyId === "PROPERTY-B") return Promise.resolve(proceduresB);
      return new Promise((resolve) => pendingA.push(resolve));
    });
    const view = render(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("form", { name: "Preventive Maintenance Form" });
    await waitFor(() => expect(pendingA.length).toBeGreaterThan(0));

    mocks.propertyId = "PROPERTY-B";
    view.rerender(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("option", { name: /Monthly chiller B inspection/ });
    pendingA.forEach((resolve) => resolve(proceduresA));

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /Weekly chiller inspection/ })).not.toBeInTheDocument();
    });
  });

  it("rejects procedure rows whose canonical property does not match the request", async () => {
    mocks.fetchProcedures.mockResolvedValue([
      { ...proceduresB[0], property_id: "PROPERTY-B" },
    ]);
    render(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("form", { name: "Preventive Maintenance Form" });

    await waitFor(() => expect(mocks.fetchProcedures).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: /Monthly chiller B inspection/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Maintenance" }));
    expect(mocks.createMasterPlan).not.toHaveBeenCalled();
  });

  it("shows no options when the selected property is unauthorized", async () => {
    mocks.propertyId = "PROPERTY-UNAUTHORIZED";
    mocks.fetchProcedures.mockResolvedValue([]);
    render(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("form", { name: "Preventive Maintenance Form" });

    await waitFor(() => expect(mocks.fetchProcedures).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: "PROPERTY-UNAUTHORIZED" }),
    ));
    expect(screen.queryByRole("option", { name: /chiller inspection/i })).not.toBeInTheDocument();
  });

  it("does not submit a manually injected foreign procedure ID", async () => {
    await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");
    setScheduledDate("2026-09-10T09:30");
    fireEvent.change(screen.getByLabelText(/Maintenance Task Template/), {
      target: { value: "502" },
    });

    fireEvent.submit(screen.getByRole("form", { name: "Preventive Maintenance Form" }));

    await waitFor(() => {
      expect(mocks.createMasterPlan).not.toHaveBeenCalled();
      expect(mocks.createMaintenance).not.toHaveBeenCalled();
    });
  });

  it("does not reconcile a successful mutation after the selected property changes", async () => {
    const rendered = await renderReadyCreate();
    await selectTemplateAndMachine("Chiller A");
    setScheduledDate("2026-09-10T09:30");
    let resolveCreate!: (value: {
      success: boolean;
      data: { plan_id: string; next_due_date: string };
    }) => void;
    mocks.createMasterPlan.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const view = screen.getByRole("form", { name: "Preventive Maintenance Form" });
    fireEvent.submit(view);
    await waitFor(() => expect(mocks.createMasterPlan).toHaveBeenCalledTimes(1));
    const pendingMutation = mocks.createMasterPlan.mock.results[0]?.value as Promise<unknown>;

    mocks.propertyId = "PROPERTY-B";
    rendered.rerender(<CreatePreventiveMaintenancePage />);
    await screen.findByRole("option", { name: /Monthly chiller B inspection/ });
    resolveCreate({
      success: true,
      data: { plan_id: "PLAN-STALE", next_due_date: "2026-09-10T09:30" },
    });
    await pendingMutation;

    expect(screen.queryByText("Preventive maintenance created successfully! Redirecting..."))
      .not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
