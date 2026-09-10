import { describe, it, expect } from "vitest";
import { timeoutPromptKind, describeTimeout } from "../../app/components/flip/turnTimeout";

describe("timeoutPromptKind", () => {
  it("is hit-freeze with no pending action", () => {
    expect(timeoutPromptKind(null)).toBe("hit-freeze");
  });

  it("is freeze-target when a freeze target is pending", () => {
    expect(timeoutPromptKind({ kind: "freeze" })).toBe("freeze-target");
  });

  it("is flip3-target when a flip3 target is pending", () => {
    expect(timeoutPromptKind({ kind: "flip3" })).toBe("flip3-target");
  });
});

describe("describeTimeout", () => {
  it.each([
    ["hit-freeze", "You went quiet — froze for the round."],
    ["freeze-target", "You didn't choose — froze yourself."],
    ["flip3-target", "You didn't choose — flipped 3 on yourself."],
  ] as const)("uses second person for the local player: %s", (kind, expected) => {
    expect(describeTimeout(kind, "Alice", true)).toBe(expected);
  });

  it.each([
    ["hit-freeze", "Alice's gone quiet — froze for the round."],
    ["freeze-target", "Alice didn't choose — froze themself."],
    ["flip3-target", "Alice didn't choose — flipped 3 on themself."],
  ] as const)("names the player for everyone else: %s", (kind, expected) => {
    expect(describeTimeout(kind, "Alice", false)).toBe(expected);
  });

  it("never blames the player — no 'you failed' or 'timeout' wording", () => {
    const messages = [
      describeTimeout("hit-freeze", "Alice", true),
      describeTimeout("freeze-target", "Alice", false),
      describeTimeout("flip3-target", "Alice", true),
    ];
    for (const m of messages) {
      expect(m.toLowerCase()).not.toMatch(/fail|timeout|you didn't respond/);
    }
  });
});
