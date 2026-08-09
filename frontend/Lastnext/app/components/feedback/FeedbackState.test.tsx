import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackState } from "./FeedbackState";

describe("FeedbackState", () => {
  it("announces errors assertively", () => {
    render(
      <FeedbackState
        variant="error"
        title="Unable to load work orders"
        description="Try again shortly."
      />,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("heading", { name: "Unable to load work orders" })).toBeVisible();
  });

  it("renders an accessible action", () => {
    render(
      <FeedbackState
        title="No work orders"
        action={<button type="button">Create work order</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Create work order" })).toBeEnabled();
  });
});
