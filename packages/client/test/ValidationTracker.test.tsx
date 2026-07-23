import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationTracker } from "../app/components/ValidationTracker";
import { makeValidationToken, resetIds } from "./fixtures";

describe("ValidationTracker (#153)", () => {
  it("renders every value with a green outline (pending) when nothing is validated", () => {
    resetIds();
    render(<ValidationTracker validationTokens={[]} missionNumber={1} />);
    const tile = screen.getByText("3");
    expect(tile.className).toContain("border-green-500");
    expect(tile.className).not.toContain("bg-green-600");
    expect(tile.className).not.toContain("bg-blue");
  });

  it("fills a validated value solid green", () => {
    resetIds();
    render(
      <ValidationTracker
        validationTokens={[makeValidationToken({ wireColor: "blue", wireValue: "3" })]}
        missionNumber={1}
      />,
    );
    const validatedTile = screen.getByText("3");
    expect(validatedTile.className).toContain("bg-green-600");

    const pendingTile = screen.getByText("4");
    expect(pendingTile.className).not.toContain("bg-green-600");
    expect(pendingTile.className).toContain("border-green-500");
  });

  it("never uses blue styling, even for blue wires", () => {
    resetIds();
    render(
      <ValidationTracker
        validationTokens={[makeValidationToken({ wireColor: "blue", wireValue: "1" })]}
        missionNumber={1}
      />,
    );
    for (const value of ["1", "2", "3", "4", "5", "6"]) {
      expect(screen.getByText(value).className).not.toMatch(/\bblue\b/);
    }
  });
});
