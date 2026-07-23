import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorToast } from "../app/components/ErrorToast";

describe("ErrorToast", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(<ErrorToast message={null} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when message is an empty string", () => {
    const { container } = render(<ErrorToast message="" onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message with an alert role when present", () => {
    render(<ErrorToast message="Not your turn" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Not your turn");
  });

  it("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ErrorToast message="Game is full" onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
