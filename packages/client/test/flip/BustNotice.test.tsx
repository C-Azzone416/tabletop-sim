import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BustNotice } from "../../app/components/flip/BustNotice";
import type { FlipCardInstance } from "../../app/components/flip/engine-types";

describe("BustNotice", () => {
  it("shows 'You busted!' and the exact card for the local player", () => {
    const card: FlipCardInstance = { id: "c1", kind: "number", value: 7 };
    render(<BustNotice playerName="Alice" isLocalPlayer card={card} onDismiss={vi.fn()} />);
    expect(screen.getByText("You busted!")).toBeInTheDocument();
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
  });

  it("names the other player rather than saying 'you' for a non-local bust", () => {
    const card: FlipCardInstance = { id: "c2", kind: "number", value: 3 };
    render(<BustNotice playerName="Bea" isLocalPlayer={false} card={card} onDismiss={vi.fn()} />);
    expect(screen.getByText("Bea busted!")).toBeInTheDocument();
  });

  it("requires an explicit dismiss — calls onDismiss only on click, never on its own", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const card: FlipCardInstance = { id: "c3", kind: "number", value: 9 };
    render(<BustNotice playerName="Alice" isLocalPlayer card={card} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows a queue position only when more than one bust is queued", () => {
    const card: FlipCardInstance = { id: "c4", kind: "number", value: 1 };
    const { rerender } = render(
      <BustNotice playerName="Alice" isLocalPlayer card={card} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();

    rerender(
      <BustNotice
        playerName="Alice"
        isLocalPlayer
        card={card}
        queuePosition={{ index: 1, total: 2 }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });
});
