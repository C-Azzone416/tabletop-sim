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

  it("styles a cut wire's value with strikethrough", () => {
    resetIds();
    const wire = makeWire({ status: "cut", value: "4" });
    render(
      <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={[]} />,
    );
    expect(screen.getByText("4").className).toContain("line-through");
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

    it("fills solid blue once an info-known wire is cut", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "7" });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).toContain("bg-blue-600");
      expect(screen.getByText("7").className).toContain("text-white");
    });

    it("does not apply the dimmed cut treatment to an info-known cut wire (blue fill instead)", () => {
      resetIds();
      const wire = makeWire({ id: "w1", status: "cut", value: "7" });
      const infoTokens = [makeInfoToken({ wireId: "w1", value: "7" })];
      const { container } = render(
        <Wire wire={wire} isLocal={false} isSelected={false} infoTokens={infoTokens} />,
      );
      const button = container.querySelector("button")!;
      expect(button.className).not.toContain("opacity-40");
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
