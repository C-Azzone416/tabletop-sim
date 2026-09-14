import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackAffordance } from "../app/components/BackAffordance";

// #451 — extracted from PlayScreen once Lobby had a real requirement for
// it: a leave has to send leave_game before it navigates, which a plain
// route <Link> can't do. Both variants share the same visual treatment.
describe("BackAffordance", () => {
  it("renders a real <Link> to href when given one, meeting the 44px touch target", () => {
    render(<BackAffordance href="/play" label="← Back" />);
    const link = screen.getByRole("link", { name: "← Back" });
    expect(link).toHaveAttribute("href", "/play");
    expect(link.className).toContain("min-h-11");
  });

  it("renders a <button> and calls onClick when given one instead of href", () => {
    const onClick = vi.fn();
    render(<BackAffordance onClick={onClick} label="← Leave" />);
    const button = screen.getByRole("button", { name: "← Leave" });
    expect(button.className).toContain("min-h-11");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables the button variant when disabled is set", () => {
    render(<BackAffordance onClick={vi.fn()} label="← Leave" disabled />);
    expect(screen.getByRole("button", { name: "← Leave" })).toBeDisabled();
  });
});
