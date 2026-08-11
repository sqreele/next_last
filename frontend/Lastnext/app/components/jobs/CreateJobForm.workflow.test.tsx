import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateJobForm from "./CreateJobForm";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  properties: [
    { id: 7, property_id: "PROPERTY-A", name: "Hotel A" },
    { id: 8, property_id: "PROPERTY-B", name: "Hotel B" },
  ],
  roomsA: [{ room_id: 101, name: "101", properties: [7] }],
  roomsB: [{ room_id: 201, name: "201", properties: [8] }],
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    isAxiosError: (error: unknown) =>
      Boolean((error as { isAxiosError?: boolean } | null)?.isAxiosError),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/app/lib/i18n/LocaleProvider", async () => {
  const { getDictionary } = await import("@/app/lib/i18n/dictionary");
  const dictionary = getDictionary("en");
  const t = (key: keyof typeof dictionary) => dictionary[key] ?? key;
  return {
    useT: () => t,
    useLocale: () => ({ locale: "en", setLocale: vi.fn(), t }),
  };
});

vi.mock("@/app/lib/session.client", () => ({
  signIn: vi.fn(),
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        accessToken: "token-a",
        username: "engineer-a",
        first_name: "Engineer",
        last_name: "A",
      },
    },
  }),
}));

vi.mock("@/app/lib/stores/mainStore", async () => {
  const React = await import("react");
  return {
    useUser: () => {
      const [selectedPropertyId, setSelectedPropertyId] = React.useState("PROPERTY-A");
      return {
        selectedPropertyId,
        setSelectedPropertyId,
        userProfile: {
          id: 1041,
          profile_id: 1041,
          user_id: 41,
          properties: mocks.properties,
        },
      };
    },
  };
});

vi.mock("@/app/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<((value: string) => void) | null>(null);
  return {
    Select: ({ onValueChange, children }: React.PropsWithChildren<{ onValueChange: (value: string) => void }>) => (
      <SelectContext.Provider value={onValueChange}><div>{children}</div></SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    SelectItem: ({ value, disabled, children }: React.PropsWithChildren<{ value: string; disabled?: boolean }>) => {
      const change = React.useContext(SelectContext);
      return <button type="button" disabled={disabled} onClick={() => change?.(value)}>{children}</button>;
    },
  };
});

vi.mock("@/app/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange, disabled }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock("@/app/components/jobs/RoomAutocomplete", () => ({
  default: ({ rooms, selectedRoom, onSelect }: {
    rooms: Array<{ room_id: number; name: string }>;
    selectedRoom: { room_id: number; name: string } | null;
    onSelect: (room: { room_id: number; name: string } | null) => void;
  }) => (
    <select
      aria-label="Room Number"
      value={selectedRoom?.room_id ?? ""}
      onChange={(event) => {
        const room = rooms.find((item) => item.room_id === Number(event.target.value)) ?? null;
        onSelect(room);
      }}
    >
      <option value="">Select room</option>
      {rooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.name}</option>)}
    </select>
  ),
}));

vi.mock("@/app/components/jobs/TopicPicker", () => ({
  default: ({ value, onChange }: {
    value: { title: string; description: string };
    onChange: (topic: { title: string; description: string }) => void;
  }) => (
    <input
      aria-label="Category"
      value={value.title}
      onChange={(event) => onChange({ title: event.target.value, description: "" })}
    />
  ),
}));

vi.mock("@/app/components/jobs/FileUpload", () => ({
  default: ({ onFileSelect }: { onFileSelect: (files: File[]) => void }) => (
    <input
      aria-label="Upload images"
      type="file"
      onChange={(event) => onFileSelect(Array.from(event.target.files ?? []))}
    />
  ),
}));

function referenceResponse(url: string, config?: { params?: Record<string, string> }) {
  if (url === "/api/rooms/") {
    return Promise.resolve({
      data: config?.params?.property === "PROPERTY-B" ? mocks.roomsB : mocks.roomsA,
    });
  }
  if (url === "/api/topics/") return Promise.resolve({ data: [{ id: 3, title: "HVAC" }] });
  if (url === "/api/areas/") return Promise.resolve({ data: [] });
  return Promise.resolve({ data: [] });
}

async function renderReadyForm() {
  render(<CreateJobForm />);
  return screen.findByPlaceholderText("Describe the maintenance job in detail...", {}, { timeout: 2500 });
}

async function fillRequiredCreateFields() {
  const description = await renderReadyForm();
  fireEvent.change(description, { target: { value: "Repair leaking air conditioner" } });
  await waitFor(() => expect(screen.getByRole("option", { name: "101" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Room Number"), { target: { value: "101" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "HVAC" } });
  const beforeImage = new File(["image"], "before.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getAllByLabelText("Upload images")[0], { target: { files: [beforeImage] } });
  return beforeImage;
}

beforeEach(() => {
  mocks.get.mockReset().mockImplementation(referenceResponse);
  mocks.post.mockReset().mockResolvedValue({ data: { job_id: "JOB-1" } });
  mocks.push.mockReset();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateJobForm workflow", () => {
  it("submits one canonical multipart request and navigates after success", async () => {
    const image = await fillRequiredCreateFields();

    const submit = await screen.findByRole("button", { name: "Create maintenance job" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [url, body, config] = mocks.post.mock.calls[0] as [string, FormData, object];
    expect(url).toBe("/api/jobs/");
    expect(config).toEqual({ withCredentials: true });
    expect(Object.fromEntries(body.entries())).toEqual(expect.objectContaining({
      description: "Repair leaking air conditioner",
      status: "pending",
      priority: "medium",
      room_id: "101",
      topic_data: JSON.stringify({ title: "HVAC", description: "" }),
      user_id: "41",
      property_id: "PROPERTY-A",
      is_defective: "false",
      is_preventivemaintenance: "false",
    }));
    expect(body.get("images")).toBe(image);
    expect(body.has("remarks")).toBe(false);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/my-jobs"), { timeout: 2500 });
  });

  it("clears a stale room and loads the new property's rooms", async () => {
    await renderReadyForm();
    await waitFor(() => expect(screen.getByRole("option", { name: "101" })).toBeInTheDocument());
    const roomSelect = screen.getByLabelText("Room Number") as HTMLSelectElement;
    fireEvent.change(roomSelect, { target: { value: "101" } });
    expect(roomSelect.value).toBe("101");

    fireEvent.click(screen.getByRole("button", { name: "Hotel B" }));

    await waitFor(() => expect(screen.getByRole("option", { name: "201" })).toBeInTheDocument());
    const hotelBRoomSelect = screen.getByLabelText("Room Number") as HTMLSelectElement;
    expect(hotelBRoomSelect.value).toBe("");
    expect(screen.queryByRole("option", { name: "101" })).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/rooms/",
      expect.objectContaining({ params: { property: "PROPERTY-B" }, withCredentials: true }),
    );

    fireEvent.change(
      screen.getByPlaceholderText("Describe the maintenance job in detail..."),
      { target: { value: "Repair the Hotel B unit" } },
    );
    fireEvent.change(hotelBRoomSelect, { target: { value: "201" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "HVAC" } });
    fireEvent.change(screen.getAllByLabelText("Upload images")[0], {
      target: { files: [new File(["image"], "hotel-b.jpg", { type: "image/jpeg" })] },
    });
    mocks.post.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Create maintenance job" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const body = mocks.post.mock.calls[0][1] as FormData;
    expect(body.get("property_id")).toBe("PROPERTY-B");
    expect(body.get("room_id")).toBe("201");
    expect(body.get("room_id")).not.toBe("101");
  });

  it("does not mutate when required fields are missing", async () => {
    const description = await renderReadyForm();
    fireEvent.submit(description.closest("form")!);

    await waitFor(() => expect(screen.getByText("Description is required")).toBeInTheDocument());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("keeps the form usable and does not navigate after API failure", async () => {
    await fillRequiredCreateFields();
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      message: "Request failed",
      response: { data: { detail: "You cannot create a job here." }, status: 403 },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Create maintenance job" }));

    await screen.findByText("You cannot create a job here.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Describe the maintenance job in detail...")).toBeEnabled();
  });
});
