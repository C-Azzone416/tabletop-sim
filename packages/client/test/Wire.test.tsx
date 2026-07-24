import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
      expect(button.className).not.toContain("bg-blue-600");
      expect(button.className).toContain("bg-zinc-100");
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
});
