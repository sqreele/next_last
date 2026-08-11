import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditJobPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ jobId: "JOB-17" }),
  useRouter: () => ({ push: mocks.push }),
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

vi.mock("@/app/components/jobs/FileUpload", () => ({
  default: ({ onFileSelect, disabled }: {
    onFileSelect: (files: File[]) => void;
    disabled?: boolean;
  }) => (
    <input
      aria-label="Add job images"
      type="file"
      disabled={disabled}
      onChange={(event) => onFileSelect(Array.from(event.target.files ?? []))}
    />
  ),
}));

const jobDetail = {
  id: 17,
  job_id: "JOB-17",
  description: "Inspect the lobby air conditioner",
  status: "in_progress",
  priority: "high",
  remarks: null,
  is_defective: true,
  is_preventivemaintenance: false,
  image_urls: [],
  property_id: "PROPERTY-A",
  rooms: [{ room_id: 101, name: "101" }],
  user: { user_id: 41, first_name: "Engineer", last_name: "A" },
  topics: [{ id: 3, title: "HVAC" }],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
  completed_at: null,
};

function response(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

async function renderHydratedEdit(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockResolvedValueOnce(response(jobDetail));
  render(<EditJobPage />);
  await screen.findByRole("heading", { name: "Edit Job #JOB-17" });
}

beforeEach(() => {
  mocks.push.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EditJobPage workflow", () => {
  it("hydrates canonical editable fields and sends one exact JSON PATCH", async () => {
    const fetchMock = vi.mocked(fetch);
    await renderHydratedEdit(fetchMock);

    expect(screen.getByLabelText("Description")).toHaveValue(
      "Inspect the lobby air conditioner",
    );
    expect(screen.getByLabelText("Status")).toHaveValue("in_progress");
    expect(screen.getByLabelText("Priority")).toHaveValue("high");
    expect(screen.getByLabelText("Remarks")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Is Defective" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Is Preventive Maintenance" }),
    ).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Air conditioner repaired" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "completed" },
    });
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "medium" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Is Defective" }));

    let resolvePatch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolvePatch = resolve; }),
    );
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/jobs/JOB-17");
    expect(request).toEqual({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Air conditioner repaired",
        status: "completed",
        priority: "medium",
        remarks: "",
        is_defective: false,
        is_preventivemaintenance: false,
      }),
    });
    expect(request.body).not.toContain("property_id");
    expect(request.body).not.toContain("room");
    expect(request.body).not.toContain("user");
    expect(request.body).not.toContain("topic");
    expect(mocks.push).not.toHaveBeenCalled();

    resolvePatch(response({ ...jobDetail, status: "completed" }));
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/jobs/JOB-17");
    });
  });

  it("submits new images in the same multipart PATCH", async () => {
    const fetchMock = vi.mocked(fetch);
    await renderHydratedEdit(fetchMock);
    const image = new File(["image"], "after.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add job images"), {
      target: { files: [image] },
    });
    fetchMock.mockResolvedValueOnce(response({ ...jobDetail, image_urls: ["after.jpg"] }));

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/jobs/JOB-17");
    expect(request.method).toBe("PATCH");
    expect(request.headers).toBeUndefined();
    expect(request.body).toBeInstanceOf(FormData);
    const body = request.body as FormData;
    expect(Object.fromEntries(body.entries())).toEqual(expect.objectContaining({
      description: "Inspect the lobby air conditioner",
      status: "in_progress",
      priority: "high",
      is_defective: "true",
      is_preventivemaintenance: "false",
    }));
    expect(body.has("remarks")).toBe(false);
    expect(body.get("images")).toBe(image);
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/jobs/JOB-17");
    });
  });

  it("shows a failed update and never reconciles it as saved", async () => {
    const fetchMock = vi.mocked(fetch);
    await renderHydratedEdit(fetchMock);
    fetchMock.mockResolvedValueOnce(
      response({ error: "You cannot update this job." }, { ok: false, status: 403 }),
    );

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A change that must not look saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText("You cannot update this job.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
