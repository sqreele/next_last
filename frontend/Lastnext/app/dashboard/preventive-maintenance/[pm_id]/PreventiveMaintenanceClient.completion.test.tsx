import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreventiveMaintenanceClient from "./PreventiveMaintenanceClient";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  confirm: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { accessToken: "token-a" } },
  }),
}));

vi.mock("@/app/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/api-client")>();
  return {
    ...actual,
    default: {
      post: mocks.post,
    },
  };
});

vi.mock("@/app/components/ui/UniversalImage", () => ({
  MaintenanceImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("@/app/lib/utils/image-utils", () => ({
  fixImageUrl: (url: string) => url,
}));

vi.mock("@/app/lib/imageUtils", () => ({
  fetchImageAsDataURL: vi.fn(),
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
  status: "active" as const,
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
  lifecycle_state: "active" as const,
  is_under_warranty: false,
  image: null,
  image_url: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
};

const maintenance = {
  pm_id: "PM-17",
  job: null,
  pmtitle: "Inspect chiller bearings",
  topics: [{ id: 3, title: "HVAC", description: null }],
  scheduled_date: "2026-08-12T02:00:00.000Z",
  completed_date: null,
  frequency: "monthly" as const,
  custom_days: null,
  next_due_date: "2026-09-12T02:00:00.000Z",
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
  updated_at: "2026-08-02T00:00:00Z",
  is_overdue: false,
  days_remaining: 0,
  machines: [machine],
  property_id: "PROPERTY-A",
  assigned_to: 41,
  assigned_to_details: null,
  created_by_details: null,
  assigned_to_name: "Engineer A",
  technician_name: "Engineer A",
  created_by_name: "Engineer A",
  master_plan: 9,
  occurrence_due_date: "2026-08-12T02:00:00.000Z",
  generated_at: "2026-08-01T00:00:00Z",
};

const completionResponse = {
  ...maintenance,
  completed_date: "2026-08-12T03:04:05.000Z",
  next_due_date: "2026-09-12T02:00:00.000Z",
  inventory_usage: [],
  next_schedule_pm_id: "PM-18",
  next_schedule_scheduled_date: "2026-09-12T02:00:00.000Z",
};

function authorizationError() {
  return {
    isAxiosError: true,
    message: "Request failed with status code 403",
    response: {
      status: 403,
      data: { detail: "You cannot complete this preventive maintenance." },
    },
    config: { url: "/api/v1/preventive-maintenance/PM-17/complete/" },
  };
}

function networkError() {
  return {
    isAxiosError: true,
    code: "ERR_NETWORK",
    message: "Network Error",
    config: {
      baseURL: "https://hotelcarepro.com",
      url: "/api/v1/preventive-maintenance/PM-17/complete/",
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-12T03:04:05.000Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.post.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
  mocks.confirm.mockReset().mockReturnValue(true);
  mocks.alert.mockReset();
  vi.stubGlobal("confirm", mocks.confirm);
  vi.stubGlobal("alert", mocks.alert);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PreventiveMaintenanceClient completion workflow", () => {
  it("sends one exact completion mutation and reconciles from a detail refresh", async () => {
    let resolveCompletion!: (value: { data: typeof completionResponse }) => void;
    mocks.post.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCompletion = resolve; }),
    );
    const view = render(<PreventiveMaintenanceClient maintenanceData={maintenance} />);

    const complete = screen.getByRole("button", { name: "Mark Complete" });
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    fireEvent.click(complete);
    fireEvent.click(complete);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [url, body, config] = mocks.post.mock.calls[0] as [string, FormData, object];
    expect(url).toBe("/api/v1/preventive-maintenance/PM-17/complete/");
    expect(config).toEqual({
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: "Bearer token-a",
      },
    });
    expect(Object.fromEntries(body.entries())).toEqual({
      completed_date: "2026-08-12T03:04:05.000Z",
    });
    expect(body.has("after_image")).toBe(false);
    expect(body.has("completion_notes")).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();

    resolveCompletion({ data: completionResponse });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.alert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeInTheDocument();

    view.rerender(
      <PreventiveMaintenanceClient maintenanceData={completionResponse} />,
    );
    expect(screen.queryByRole("button", { name: "Mark Complete" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Completed/).length).toBeGreaterThan(0);
  });

  it("shows an authorization failure without completion side effects", async () => {
    mocks.post.mockRejectedValueOnce(authorizationError());
    render(<PreventiveMaintenanceClient maintenanceData={maintenance} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));

    await screen.findByText("You cannot complete this preventive maintenance.");
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });

  it("resets after a network failure and allows one clean retry", async () => {
    mocks.post
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ data: completionResponse });
    render(<PreventiveMaintenanceClient maintenanceData={maintenance} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));

    await screen.findByText(/Network Error: Unable to connect/);
    expect(mocks.refresh).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: "Mark Complete" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.alert).toHaveBeenCalledTimes(1);
  });
});
