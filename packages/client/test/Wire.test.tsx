import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Wire } from "../app/components/Wire";
import { makeWire, resetIds } from "./fixtures";

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
});
