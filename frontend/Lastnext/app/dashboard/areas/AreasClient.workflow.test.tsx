import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AreasClient from "./AreasClient";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  toast: vi.fn(),
  selectedPropertyId: "PROPERTY-A" as string | null,
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
    isAxiosError: (error: unknown) => Boolean(
      typeof error === "object" && error !== null && "isAxiosError" in error,
    ),
    isCancel: (error: unknown) => Boolean(
      typeof error === "object" && error !== null && "code" in error && error.code === "ERR_CANCELED",
    ),
  },
}));

vi.mock("@/app/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const propertyA = {
  id: 1001,
  property_id: "PROPERTY-A",
  name: "Hotel Alpha",
};
const propertyB = {
  id: 2002,
  property_id: "PROPERTY-B",
  name: "Hotel Bravo",
};

const userProfile = {
  id: 6006,
  profile_id: 6006,
  user_id: 5005,
  username: "area-user",
  email: "area@example.com",
  first_name: "Area",
  last_name: "User",
  display_name: "Area User",
  profile_image: null,
  positions: "Engineer",
  properties: [propertyA, propertyB],
  user_property_name: null,
  user_property_id: null,
  profile_property_name: null,
  profile_property_id: null,
  created_at: "2026-08-12T00:00:00Z",
  email_notifications_enabled: true,
};

function area(
  id: number,
  property: typeof propertyA,
  name: string,
  isActive = true,
) {
  return {
    id,
    name,
    description: `${name} description`,
    is_active: isActive,
    property: property.id,
    property_name: property.name,
    property_uuid: property.property_id,
    jobs_count: 0,
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  };
}

const areaA = area(3003, propertyA, "Area Alpha");
const areaB = area(4004, propertyB, "Area Bravo");

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({
    userProfile,
    selectedPropertyId: mocks.selectedPropertyId,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function propertyForRequest(config?: { params?: { property_id?: string } }) {
  return config?.params?.property_id ?? mocks.selectedPropertyId;
}

function installDefaultGets() {
  mocks.get.mockImplementation((url: string, config?: { params?: { property_id?: string } }) => {
    if (url === "/api/properties/") return Promise.resolve({ data: [propertyA, propertyB] });
    if (url === "/api/areas/") {
      return Promise.resolve({
        data: propertyForRequest(config) === "PROPERTY-B" ? [areaB] : [areaA],
      });
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

async function renderAreas() {
  const view = render(<AreasClient />);
  await screen.findAllByText("Area Alpha");
  return view;
}

beforeEach(() => {
  mocks.selectedPropertyId = "PROPERTY-A";
  vi.clearAllMocks();
  installDefaultGets();
});

afterEach(() => {
  cleanup();
});

describe("Areas CRUD property-context workflow", () => {
  it("ignores a late Property A list after Property B becomes active", async () => {
    const propertyARequest = deferred<{ data: typeof areaA[] }>();
    const propertyBRequest = deferred<{ data: typeof areaB[] }>();
    mocks.get.mockImplementation((url: string, config?: { params?: { property_id?: string } }) => {
      if (url === "/api/properties/") return Promise.resolve({ data: [propertyA, propertyB] });
      return propertyForRequest(config) === "PROPERTY-B"
        ? propertyBRequest.promise
        : propertyARequest.promise;
    });

    const view = render(<AreasClient />);
    mocks.selectedPropertyId = "PROPERTY-B";
    view.rerender(<AreasClient />);

    await act(async () => propertyBRequest.resolve({ data: [areaB] }));
    expect((await screen.findAllByText("Area Bravo")).length).toBeGreaterThan(0);

    await act(async () => propertyARequest.resolve({ data: [areaA] }));
    expect(screen.queryByText("Area Alpha")).not.toBeInTheDocument();
    expect(screen.getAllByText("Area Bravo").length).toBeGreaterThan(0);
  });

  it("binds create to Property A, blocks double-submit, and leaves Property B untouched", async () => {
    const createRequest = deferred<{ data: ReturnType<typeof area> }>();
    mocks.post.mockReturnValue(createRequest.promise);
    const view = await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Lobby, Pump Room"), {
      target: { value: "New Area Alpha" },
    });
    const createButton = screen.getByRole("button", { name: "Create" });
    fireEvent.click(createButton);
    fireEvent.click(createButton);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/areas/",
      expect.objectContaining({ name: "New Area Alpha", property_id: 1001 }),
      { withCredentials: true },
    );

    mocks.selectedPropertyId = "PROPERTY-B";
    view.rerender(<AreasClient />);
    expect((await screen.findAllByText("Area Bravo")).length).toBeGreaterThan(0);

    await act(async () => createRequest.resolve({
      data: area(7007, propertyA, "New Area Alpha"),
    }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Add Area" })).not.toBeInTheDocument());
    expect(screen.queryByText("New Area Alpha")).not.toBeInTheDocument();
    expect(screen.getAllByText("Area Bravo").length).toBeGreaterThan(0);
  });

  it("uses canonical Area 3003 for edit and preserves the form after a 403", async () => {
    const editRequest = deferred<{ data: typeof areaA }>();
    mocks.patch.mockReturnValue(editRequest.promise);
    const view = await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Edit Area Alpha" }));
    const nameInput = screen.getByDisplayValue("Area Alpha");
    fireEvent.change(nameInput, { target: { value: "Area Alpha Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.patch).toHaveBeenCalledWith(
      "/api/areas/3003/",
      expect.objectContaining({ name: "Area Alpha Updated", property_id: 1001 }),
      { withCredentials: true },
    );

    mocks.selectedPropertyId = "PROPERTY-B";
    view.rerender(<AreasClient />);
    await screen.findAllByText("Area Bravo");
    await act(async () => editRequest.reject({
      isAxiosError: true,
      message: "Forbidden",
      response: { status: 403, data: { detail: "Area is outside your property." } },
    }));

    expect(screen.getByDisplayValue("Area Alpha Updated")).toBeInTheDocument();
    expect(screen.getAllByText("Area Bravo").length).toBeGreaterThan(0);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error",
      description: "Area is outside your property.",
    }));
  });

  it("preserves create input after a 400 response without false reconciliation", async () => {
    mocks.post.mockRejectedValue({
      isAxiosError: true,
      message: "Bad request",
      response: { status: 400, data: { name: ["An Area with this name already exists."] } },
    });
    await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Lobby, Pump Room"), {
      target: { value: "Duplicate Area" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error",
      description: "name: An Area with this name already exists.",
    })));
    expect(screen.getByDisplayValue("Duplicate Area")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Area" })).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("reconciles a successful edit from an authoritative scoped refetch", async () => {
    const updatedArea = area(3003, propertyA, "Area Alpha Updated");
    let areaListCalls = 0;
    mocks.get.mockImplementation((url: string) => {
      if (url === "/api/properties/") return Promise.resolve({ data: [propertyA, propertyB] });
      areaListCalls += 1;
      return Promise.resolve({ data: areaListCalls === 1 ? [areaA] : [updatedArea] });
    });
    mocks.patch.mockResolvedValue({ data: updatedArea });
    await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Edit Area Alpha" }));
    fireEvent.change(screen.getByDisplayValue("Area Alpha"), {
      target: { value: "Area Alpha Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findAllByText("Area Alpha Updated")).length).toBeGreaterThan(0);
    expect(areaListCalls).toBe(2);
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });

  it("deactivates canonical Area 3003 once and never reconciles it into Property B", async () => {
    const deleteRequest = deferred<{ data: ReturnType<typeof area> }>();
    mocks.delete.mockReturnValue(deleteRequest.promise);
    const view = await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Delete Area Alpha" }));
    const deactivateButton = screen.getByRole("button", { name: "Deactivate" });
    fireEvent.click(deactivateButton);
    fireEvent.click(deactivateButton);
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.delete).toHaveBeenCalledWith("/api/areas/3003/", { withCredentials: true });

    mocks.selectedPropertyId = "PROPERTY-B";
    view.rerender(<AreasClient />);
    await screen.findAllByText("Area Bravo");
    await act(async () => deleteRequest.resolve({ data: area(3003, propertyA, "Area Alpha", false) }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Deactivate area?" })).not.toBeInTheDocument());
    expect(screen.queryByText("Area Alpha")).not.toBeInTheDocument();
    expect(screen.getAllByText("Area Bravo").length).toBeGreaterThan(0);
  });

  it("preserves the authoritative Area and confirmation after deactivate failure", async () => {
    mocks.delete.mockRejectedValue({
      isAxiosError: true,
      message: "Network unavailable",
    });
    await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Delete Area Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error",
      description: "Network unavailable",
    })));
    expect(screen.getByRole("heading", { name: "Deactivate area?" })).toBeInTheDocument();
    expect(screen.getAllByText("Area Alpha").length).toBeGreaterThan(0);
    expect(mocks.delete).toHaveBeenCalledTimes(1);
  });

  it("ignores a mutation response that arrives after unmount", async () => {
    const createRequest = deferred<{ data: ReturnType<typeof area> }>();
    mocks.post.mockReturnValue(createRequest.promise);
    const view = await renderAreas();

    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Lobby, Pump Room"), {
      target: { value: "Unmounted Area" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(mocks.post).toHaveBeenCalledTimes(1);

    const areaGetCount = mocks.get.mock.calls.filter(([url]) => url === "/api/areas/").length;
    view.unmount();
    await act(async () => createRequest.resolve({
      data: area(7007, propertyA, "Unmounted Area"),
    }));

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.get.mock.calls.filter(([url]) => url === "/api/areas/")).toHaveLength(areaGetCount);
  });
});
