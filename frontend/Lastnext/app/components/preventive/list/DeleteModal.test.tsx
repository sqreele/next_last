import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeleteModal from "./DeleteModal";

afterEach(cleanup);

describe("PM delete confirmation", () => {
  it("cancels with zero delete confirmations", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteModal onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("locks confirmation and cancellation while deletion is pending", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteModal
        onConfirm={onConfirm}
        onCancel={onCancel}
        isDeleting
      />,
    );

    const deleting = screen.getByRole("button", { name: "Deleting..." });
    expect(deleting).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(deleting);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
