import { describe, it, expect } from "vitest";
import { parseSeatOptions } from "../app/game/[joinCode]/parseSeatOptions";

describe("parseSeatOptions", () => {
  it("returns an empty array when raw is undefined", () => {
    expect(parseSeatOptions(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseSeatOptions("")).toEqual([]);
  });

  it("parses a valid JSON array of seats", () => {
    const raw = JSON.stringify([
      { name: "Dev", profileId: "p1" },
      { name: "Alice", profileId: "p2" },
    ]);
    expect(parseSeatOptions(raw)).toEqual([
      { name: "Dev", profileId: "p1" },
      { name: "Alice", profileId: "p2" },
    ]);
  });

  it("returns an empty array for malformed JSON rather than throwing", () => {
    expect(parseSeatOptions("{not valid json")).toEqual([]);
  });

  it("returns an empty array when the parsed value is not an array", () => {
    expect(parseSeatOptions(JSON.stringify({ name: "Dev", profileId: "p1" }))).toEqual([]);
  });

  it("filters out entries missing name or profileId", () => {
    const raw = JSON.stringify([
      { name: "Dev", profileId: "p1" },
      { name: "Alice" },
      { profileId: "p3" },
      { name: 1, profileId: "p4" },
      null,
      "not an object",
    ]);
    expect(parseSeatOptions(raw)).toEqual([{ name: "Dev", profileId: "p1" }]);
  });
});
