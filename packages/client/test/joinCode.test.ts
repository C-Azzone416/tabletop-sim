import { describe, it, expect } from "vitest";
import { isValidJoinCodeFormat } from "../app/lib/joinCode";

describe("isValidJoinCodeFormat", () => {
  it("accepts a 6-char code from the server's alphabet", () => {
    expect(isValidJoinCodeFormat("ABCDEF")).toBe(true);
    expect(isValidJoinCodeFormat("234567")).toBe(true);
  });

  it("rejects codes of the wrong length", () => {
    expect(isValidJoinCodeFormat("ABCDE")).toBe(false);
    expect(isValidJoinCodeFormat("ABCDEFG")).toBe(false);
    expect(isValidJoinCodeFormat("")).toBe(false);
  });

  it("rejects characters excluded from the server's alphabet (I, O, 0, 1)", () => {
    expect(isValidJoinCodeFormat("ABCDEI")).toBe(false);
    expect(isValidJoinCodeFormat("ABCDEO")).toBe(false);
    expect(isValidJoinCodeFormat("ABCDE0")).toBe(false);
    expect(isValidJoinCodeFormat("ABCDE1")).toBe(false);
  });

  it("rejects lowercase (callers are expected to uppercase first)", () => {
    expect(isValidJoinCodeFormat("abcdef")).toBe(false);
  });

  it("rejects whitespace or symbols", () => {
    expect(isValidJoinCodeFormat("ABC DE")).toBe(false);
    expect(isValidJoinCodeFormat("ABC-DE")).toBe(false);
  });
});
