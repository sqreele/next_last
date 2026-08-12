import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryCsvImport } from "./InventoryCsvImport";

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

function selectInventoryCsv(file: File) {
  const input = document.querySelector<HTMLInputElement>("#inventory-csv-file");
  expect(input).not.toBeNull();
  expect(input).toHaveAttribute("accept", ".csv,text/csv");
  fireEvent.change(input!, { target: { files: [file] } });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

describe("inventory CSV import workflow", () => {
  it("posts one exact scoped multipart request and reconciles partial success", async () => {
    const onImported = vi.fn();
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(
      <InventoryCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    const file = new File(
      ["name,quantity,min_quantity\nFilter,4,1\n,2,1\n"],
      "inventory.csv",
      { type: "text/csv" },
    );
    selectInventoryCsv(file);
    expect(screen.getAllByText("inventory.csv").length).toBeGreaterThan(0);
    const submit = screen.getByRole("button", { name: "Import" });

    act(() => {
      submit.click();
      submit.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hotelcarepro.com/api/v1/inventory/bulk-import/?property_id=PROPERTY-A",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer token-a" });
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(Array.from(body.keys())).toEqual(["file", "property_id"]);
    expect(body.getAll("file")).toEqual([file]);
    expect(body.getAll("property_id")).toEqual(["PROPERTY-A"]);

    pending.resolve(jsonResponse({
      created_count: 1,
      error_count: 1,
      created: [{ row: 2, item_id: "INV-1", name: "Filter" }],
      errors: [{ row: 3, error: "name is required." }],
    }, 207));

    await screen.findByText(/Imported 1 item.*1 row\(s\) skipped/);
    expect(screen.getByText("Row 3: name is required.")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("keeps authorization failures recoverable without reconciliation", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "You have no property access — cannot import inventory." }, 403),
    );
    render(
      <InventoryCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectInventoryCsv(new File(["name,quantity\nFilter,2\n"], "inventory.csv", {
      type: "text/csv",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("You have no property access — cannot import inventory.");
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("renders an all-row validation failure without reconciliation", async () => {
    const onImported = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      created_count: 0,
      error_count: 1,
      created: [],
      errors: [{ row: 2, error: "quantity and min_quantity must be integers." }],
    }, 400));
    render(
      <InventoryCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectInventoryCsv(new File(
      ["name,quantity,min_quantity\nFilter,wrong,1\n"],
      "invalid-inventory.csv",
      { type: "text/csv" },
    ));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText(/Imported 0 items.*1 row\(s\) skipped/);
    expect(
      screen.getByText("Row 2: quantity and min_quantity must be integers."),
    ).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("locks the selected file and dialog while an inventory import is pending", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<InventoryCsvImport currentPropertyId="PROPERTY-A" />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectInventoryCsv(new File(["name,quantity\nFilter,2\n"], "inventory-a.csv", {
      type: "text/csv",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(document.querySelector("#inventory-csv-file")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Bulk-import inventory" })).toBeInTheDocument();

    pending.resolve(jsonResponse({
      created_count: 1,
      error_count: 0,
      created: [{ row: 2, item_id: "INV-1", name: "Filter" }],
      errors: [],
    }, 201));
    await screen.findByText("Imported 1 item.");
  });

  it("recovers from a network failure and allows a manual retry", async () => {
    const onImported = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(jsonResponse({
        created_count: 1,
        error_count: 0,
        created: [{ row: 2, item_id: "INV-1", name: "Filter" }],
        errors: [],
      }, 201));
    render(
      <InventoryCsvImport currentPropertyId="PROPERTY-A" onImported={onImported} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    selectInventoryCsv(new File(["name,quantity\nFilter,2\n"], "inventory.csv", {
      type: "text/csv",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByText("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText("Imported 1 item.");
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
