import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyCsvImport } from "@/app/components/properties/PropertyCsvImport";
import { RoomCsvImport } from "@/app/components/rooms/RoomCsvImport";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { accessToken: "token-a" } },
  }),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function selectCsv(file: File) {
  const input = document.querySelector<HTMLInputElement>("#csv-import-file");
  expect(input).not.toBeNull();
  expect(input).toHaveAttribute("accept", ".csv,text/csv");
  fireEvent.change(input!, { target: { files: [file] } });
  return input!;
}

function uploadedFormData() {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ Authorization: "Bearer token-a" });
  expect(init.body).toBeInstanceOf(FormData);
  return init.body as FormData;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("shared property and room CSV import workflows", () => {
  it("imports a property CSV once, preserves exact multipart data, and reconciles partial success", async () => {
    const onImported = vi.fn();
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<PropertyCsvImport onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    const file = new File(
      ["name,property_id,description\nHotel A,,Primary\n,PROP-B,Missing name\n"],
      "properties.csv",
      { type: "text/csv" },
    );
    selectCsv(file);
    expect(screen.getAllByText("properties.csv").length).toBeGreaterThan(0);
    const submit = screen.getByRole("button", { name: "Import" });
    expect(submit).toBeEnabled();

    act(() => {
      submit.click();
      submit.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hotelcarepro.com/api/v1/properties/bulk-import/",
    );
    const body = uploadedFormData();
    expect(Array.from(body.keys())).toEqual(["file"]);
    expect(body.getAll("file")).toEqual([file]);

    pending.resolve(jsonResponse({
      created_count: 1,
      attached_count: 0,
      error_count: 1,
      created: [{ row: 2, property_id: "PROP-A", name: "Hotel A" }],
      attached: [],
      errors: [{ row: 3, error: "name is required." }],
    }, 207));

    await screen.findByText(/Imported 1 item.*1 new, 0 re-attached.*1 row\(s\) skipped/);
    expect(screen.getByText("Row 3: name is required.")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onImported.mock.calls[0][0]).toMatchObject({ created_count: 1, error_count: 1 });
  });

  it("keeps a rejected property file recoverable without false reconciliation", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Only staff can bulk-import properties." }, 403),
    );
    render(<PropertyCsvImport onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectCsv(new File(["name\nHotel A\n"], "properties.txt", { type: "text/plain" }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("Only staff can bulk-import properties.");
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    expect(screen.getAllByText("properties.txt").length).toBeGreaterThan(0);
  });

  it("renders a complete row-validation failure without reporting imported data", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      created_count: 0,
      attached_count: 0,
      error_count: 1,
      created: [],
      attached: [],
      errors: [{ row: 2, error: "name is required." }],
    }, 400));
    render(<PropertyCsvImport onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectCsv(new File(["name\n\n"], "invalid-properties.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText(/Imported 0 items.*1 row\(s\) skipped/);
    expect(screen.getByText("Row 2: name is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another file" })).toBeEnabled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("uses the current room property at submit time and returns a full-success result", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      created_count: 2,
      attached_count: 1,
      error_count: 0,
      created: [
        { row: 2, room_id: 11, name: "201" },
        { row: 3, room_id: 12, name: "202" },
      ],
      attached: [{ row: 4, room_id: 13, name: "203" }],
      errors: [],
    }, 201));
    const view = render(
      <RoomCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    const file = new File(
      ["name,room_type,is_active\n201,Suite,true\n"],
      "rooms.csv",
      { type: "text/csv" },
    );
    selectCsv(file);
    view.rerender(
      <RoomCsvImport currentPropertyId="PROPERTY B" onImported={onImported} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hotelcarepro.com/api/v1/rooms/bulk-import/?property_id=PROPERTY%20B",
    );
    const body = uploadedFormData();
    expect(Array.from(body.keys())).toEqual(["file", "property_id"]);
    expect(body.getAll("file")).toEqual([file]);
    expect(body.getAll("property_id")).toEqual(["PROPERTY B"]);
    await screen.findByText(/Imported 3 items.*2 new, 1 re-attached/);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("shows a room server failure without a result or refresh", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Database unavailable" }, 503));
    render(<RoomCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectCsv(new File(["name\n101\n"], "rooms.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("Server error — try again.");
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.queryByText(/Imported \d+ item/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("locks the selected room file and dialog while its request is in flight", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<RoomCsvImport currentPropertyId="PROPERTY-A" />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectCsv(new File(["name\n101\n"], "rooms-a.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    const input = document.querySelector<HTMLInputElement>("#csv-import-file");
    expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Bulk-import rooms" })).toBeInTheDocument();

    pending.resolve(jsonResponse({
      created_count: 1,
      attached_count: 0,
      error_count: 0,
      created: [{ row: 2, room_id: 11, name: "101" }],
      attached: [],
      errors: [],
    }, 201));
    await screen.findByText(/Imported 1 item/);
  });

  it("surfaces the backend empty-file validation without false success", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Send a CSV either as `file` (multipart) or `csv` (JSON string)." }, 400),
    );
    render(<RoomCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectCsv(new File([], "empty.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText(/Send a CSV either as/);
    expect(onImported).not.toHaveBeenCalled();
  });
});
