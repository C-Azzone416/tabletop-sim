import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wire } from "../app/components/Wire";
import { makeWire, makeInfoToken, resetIds } from "./fixtures";

describe("Wire (#156)", () => {
  it("shows the value (not a bare X) when cut", () => {
    resetIds();
    const wire = makeWire({ status: "cut", value: "4" });
    render(
      <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  // #173: cut-wire values are public info and must be easy to read —
  // plain grey text, no strikethrough.
  it("styles a cut wire's value plainly, without strikethrough (#173)", () => {
    resetIds();
    const wire = makeWire({ status: "cut", value: "4" });
    const { container } = render(
      <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
    );
    expect(screen.getByText("4").className).not.toContain("line-through");
    expect(container.querySelector("button")!.className).not.toContain("opacity-40");
  });

  it("shows the value for a revealed (mid-dual-cut) wire, without strikethrough", () => {
    resetIds();
    const wire = makeWire({ status: "revealed", value: "5" });
    render(
      <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
    );
    const el = screen.getByText("5");
    expect(el).toBeInTheDocument();
    expect(el.className).not.toContain("line-through");
  });

  it("does not show a value for a hidden wire owned by another player", () => {
    resetIds();
    const wire = makeWire({ status: "hidden", value: null });
    render(
      <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
    );
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("shows the value for the local player's own hidden wire (regression: an earlier fix for #156 accidentally hid this)", () => {
    resetIds();
    const wire = makeWire({ status: "hidden", value: "6" });
    render(
      <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} />,
    );
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("cut wire is disabled and not clickable", () => {
    resetIds();
    const wire = makeWire({ status: "cut", value: "4" });
    render(
      <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} onSelect={() => {}} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  describe("info token treatment (#159 item 4)", () => {
    it("shows the info token's tracked value, with a blue outline, on a hidden opponent wire", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const el = screen.getByText("7");
      expect(el).toBeInTheDocument();
      expect(el.getAttribute("data-testid")).toBe("wire-info-token");
    });

    // #173 ruling (amends #159 item 4): the "solid blue when cut" half is
    // retired — a cut wire gets the same dim-grey/plain-value treatment
    // whether or not it carries an info token.
    it("uses the single grey cut treatment for an info-known cut wire — no blue fill (#173)", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "7" });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).not.toContain("bg-p2");
      expect(button.className).toContain("bg-outline/10");
      expect(screen.getByText("7").className).not.toContain("text-white");
      expect(screen.getByText("7").className).not.toContain("line-through");
    });

    it("renders cut wires identically with and without an info token (#173)", () => {
      resetIds();
      const bare = render(
        <Wire
          wire={makeWire({ id: "w1", status: "cut", value: "7" })}
          isLocal={false}
          isSelected={false}
          infoTokens={[]}
        />,
      );
      const bareClasses = bare.container.querySelector("button")!.className;
      bare.unmount();

      resetIds();
      const withToken = render(
        <Wire
          wire={makeWire({ id: "w1", status: "cut", value: "7" })}
          isLocal={false}
          isSelected={false}
          infoTokens={[makeInfoToken({ wireId: "w1", value: "7" })]}
        />,
      );
      expect(withToken.container.querySelector("button")!.className).toBe(bareClasses);
    });

    it("prefers the wire's real value over the info token's once it's known (e.g. own hidden wire)", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: "6" });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire wire={wire} isLocal isSelected={false} infoTokens={infoTokens} />,
      );
      expect(screen.getByText("6")).toBeInTheDocument();
      expect(screen.queryByText("7")).not.toBeInTheDocument();
    });
  });

  // #188 (Caroline's ruling): color moves off the tile back and onto the
  // numeral; hidden tile backs are one uniform neutral regardless of color.
  describe("uniform neutral backs, color on the numeral (#188)", () => {
    it("gives an own-rack wire's numeral the wire's color, not the background", () => {
      resetIds();
      const wire = makeWire({ status: "hidden", value: "6", color: "yellow" });
      const { container } = render(
        <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} />,
      );
      expect(screen.getByText("6").className).toContain("text-p3");
      const button = container.querySelector("button")!;
      expect(button.className).not.toContain("bg-p3");
      expect(button.className).not.toContain("bg-p2");
    });

    it("gives a cut wire's numeral the wire's color while keeping the dim-grey background (#173)", () => {
      resetIds();
      const wire = makeWire({ status: "cut", value: "9", color: "red" });
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      expect(screen.getByText("9").className).toContain("text-p1");
      const button = container.querySelector("button")!;
      expect(button.className).toContain("bg-outline/10");
      expect(button.className).not.toContain("bg-p1");
    });

    it("never tints the background by color, for any color, on a non-cut wire", () => {
      for (const color of ["blue", "yellow", "red"] as const) {
        resetIds();
        const wire = makeWire({ status: "hidden", value: "3", color });
        const { container, unmount } = render(
          <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} />,
        );
        const button = container.querySelector("button")!;
        expect(button.className).toContain("bg-game-table");
        expect(button.className).not.toMatch(/bg-p[123](?!-ink)/);
        unmount();
      }
    });

    it("keeps the pending-info-token blue text on a hidden opponent wire regardless of the (redacted) wire color", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null, color: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      expect(screen.getByText("7").className).toContain("text-p2");
    });
  });

  // #200 (Caroline's ruling): a pending info token reads as a placed token —
  // a circular chip, distinct in shape from the rectangular wire tile — not
  // just a color variant of the same rectangle.
  describe("circular token shape for a pending info token (#200)", () => {
    it("renders a pending info token as a circular chip, not the rectangular wire tile", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).toContain("rounded-full");
      expect(button.className).not.toContain("rounded-lg");
    });

    it("uses the plain rectangular tile shape once there is no info token", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: "6" });
      const { container } = render(
        <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).toContain("rounded-lg");
      expect(button.className).not.toContain("rounded-full");
    });

    it("reverts to the rectangular cut-tile shape once the token's wire is cut (#173)", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "7" });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).toContain("rounded-lg");
      expect(button.className).not.toContain("rounded-full");
    });

    it("stays clickable and calls onSelect for a pending info-token wire", async () => {
      resetIds();
      const onSelect = vi.fn();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire
          wire={wire}
          isLocal={false}
          isSelected={false}
          infoTokens={infoTokens}
          onSelect={onSelect}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId("wire-info-token"));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("is disabled when no onSelect is provided, same as any other non-interactive tile", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      expect(screen.getByTestId("wire-info-token")).toBeDisabled();
    });
  });

  // #190 Phase B: a wrong-guess against yellow places an InfoToken with the
  // 'YELLOW' sentinel value (game-engine.ts), reusing the existing token
  // mechanism rather than a new shape. Yellow has no numeric identity
  // during play, so the indicator is outline-only, no number.
  describe("yellow wrong-guess indicator (#190)", () => {
    it("renders a yellow-outlined chip with no number for a 'YELLOW' sentinel token", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null, color: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "YELLOW" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).toContain("border-p3");
      expect(button.className).toContain("rounded-full");
      expect(screen.queryByText("YELLOW")).not.toBeInTheDocument();
      expect(button.textContent).toBe("");
    });

    it("still carries the circular chip shape and stays clickable, same as the numbered blue token", async () => {
      resetIds();
      const onSelect = vi.fn();
      const wire = makeWire({ id: "w1", status: "hidden", value: null, color: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "YELLOW" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} onSelect={onSelect} />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId("wire-info-token"));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("does not use the yellow treatment for a normal numbered info token", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).not.toContain("border-p3");
      expect(button.className).toContain("border-p2");
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("exposes the sentinel via data-wire-value for E2E/logic reads", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null, color: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "YELLOW" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      expect(screen.getByTestId("wire-info-token")).toHaveAttribute("data-wire-value", "YELLOW");
    });
  });

  // #190: "revealed" (reveal_reds, or the interim half of a dual-cut) is
  // distinct from both untouched-hidden and cut — it must not fall through
  // to plain hidden styling.
  describe("revealed-not-cut treatment (#190)", () => {
    it("gives a revealed wire a distinct border/background from both hidden and cut", () => {
      resetIds();
      const hidden = render(
        <Wire wire={makeWire({ status: "hidden", value: "5" })} isLocal isSelected={false} infoTokens={[]} />,
      );
      const hiddenClasses = hidden.container.querySelector("button")!.className;
      hidden.unmount();

      resetIds();
      const cut = render(
        <Wire wire={makeWire({ status: "cut", value: "5" })} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      const cutClasses = cut.container.querySelector("button")!.className;
      cut.unmount();

      resetIds();
      const revealed = render(
        <Wire wire={makeWire({ status: "revealed", value: "5" })} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      const revealedClasses = revealed.container.querySelector("button")!.className;

      expect(revealedClasses).not.toBe(hiddenClasses);
      expect(revealedClasses).not.toBe(cutClasses);
      expect(revealedClasses).toContain("bg-warning/10");
      expect(revealedClasses).toContain("border-warning");
    });

    it("is not disabled or grey like a cut wire", () => {
      resetIds();
      const wire = makeWire({ status: "revealed", value: "5" });
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} onSelect={() => {}} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).not.toContain("bg-outline/10");
      expect(button).not.toBeDisabled();
    });
  });

  // #210: E2E helpers read wire values off a stable data-wire-value
  // attribute rather than the tile's inner markup, since #200's shape
  // rework broke a class-selector-based read (span.text-lg.font-bold no
  // longer exists on the circular pending-info-token chip).
  describe("data-wire-value attribute (#210)", () => {
    it("carries the displayed value on a pending info-token wire", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      expect(screen.getByTestId("wire-info-token")).toHaveAttribute("data-wire-value", "7");
    });

    it("carries the displayed value on an own hidden wire with no token", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: "6" });
      const { container } = render(
        <Wire wire={wire} isLocal isSelected={false} infoTokens={[]} />,
      );
      expect(container.querySelector("button")).toHaveAttribute("data-wire-value", "6");
    });

    it("carries the value on a cut wire", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "4" });
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      expect(container.querySelector("button")).toHaveAttribute("data-wire-value", "4");
    });

    it("omits the attribute for a hidden wire with no known value and no token", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "hidden", value: null });
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      expect(container.querySelector("button")).not.toHaveAttribute("data-wire-value");
    });

    // #190: yellow/red decimal values (e.g. a yellow "4.1") must round-trip
    // through data-wire-value exactly as the string they arrive as.
    it("carries a decimal yellow/red value unchanged", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "4.1", color: "yellow" });
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
      );
      expect(container.querySelector("button")).toHaveAttribute("data-wire-value", "4.1");
    });
  });
});
