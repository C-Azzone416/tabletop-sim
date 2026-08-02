import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// #245: "yours" (the rack tint) and "yellow wire" (a rule-bearing game value)
// were the same hex — #FFC53D — in light mode, on a surface that is full of
// wire tiles. That was not a near-miss anyone had to eyeball; it was byte
// equality, and it survived a design review, a token migration (#233/#241) and
// a token split (#247) because nothing ever compared the two values.
//
// This asserts the property directly against theme.css. It is deliberately a
// text-level check rather than a rendered one: the defect lives in the token
// file, and a jsdom render can't see computed custom properties anyway (Tailwind
// never runs, and `css: false` in vitest.config.ts skips stylesheets entirely).
// The *rendered* judgement — "does this read as yours" — is the E2E/visual job.

const THEME = path.resolve(__dirname, "../styles/theme.css");

/** Pull `--name: #hex;` pairs out of one declaration block. */
function tokensIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
    out.set(m[1], m[2].toUpperCase());
  }
  return out;
}

/** Slice the balanced `{...}` body that follows `selector` in the source. */
function blockAfter(src: string, selector: string): string {
  const start = src.indexOf(selector);
  expect(start, `selector ${selector} missing from theme.css`).toBeGreaterThan(-1);
  let i = src.indexOf("{", start);
  let depth = 0;
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced block for ${selector}`);
}

const css = readFileSync(THEME, "utf8");

// Every scheme a player can actually be looking at. The OS-preference block is
// a hand-maintained duplicate of `.dark`, so it gets checked independently —
// a fix applied to only one of the two is exactly the kind of drift that would
// reintroduce this bug in whichever scheme got missed.
const SCHEMES: Array<[string, string]> = [
  ["light (:root)", ":root {"],
  ["dark (.dark)", ".dark {"],
  ["dark (prefers-color-scheme)", ":root:not(.light) {"],
];

// Tokens that mean "this is yours" / "this is the game's chrome". None of them
// is a wire, so none of them may wear a wire's colour.
const NON_WIRE_TOKENS = [
  "--surface-rack",
  "--rack-ink",
  "--rack-border",
  "--game-rack",
  "--game-rack-ink",
  "--game-rack-border",
];

const WIRE_TOKENS = ["--wire-blue", "--wire-yellow", "--wire-red"];

describe("theme.css — wire colours are not reused for non-wire meanings (#245)", () => {
  for (const [label, selector] of SCHEMES) {
    const tokens = tokensIn(blockAfter(css, selector));

    it(`${label}: no rack token shares a hex with a wire token`, () => {
      const wireHexes = new Map(
        WIRE_TOKENS.map((w) => {
          const hex = tokens.get(w);
          expect(hex, `${w} missing in ${label}`).toBeDefined();
          return [hex as string, w];
        }),
      );

      const collisions = NON_WIRE_TOKENS.flatMap((t) => {
        const hex = tokens.get(t);
        if (hex === undefined) return [];
        const wire = wireHexes.get(hex);
        return wire ? [`${t} (${hex}) === ${wire}`] : [];
      });

      expect(collisions, `${label}: wire colour reused for a non-wire meaning`).toEqual([]);
    });
  }

  // The rack is the private surface (DESIGN.md C1) — it has to be obviously
  // not-an-opponent's-rack. The old dark pairing was #3D3312 on #132741 =
  // 1.21:1, which is why dark leaned on a full-brightness --wire-yellow border
  // to carry the signal at all. Fixing the hue collision must not hand that
  // weakness back, so the separation is asserted rather than trusted.
  it.each([
    ["light (:root)", ":root {"],
    ["dark (.dark)", ".dark {"],
  ])("%s: own rack is separable from an opponent's rack", (_label, selector) => {
    const tokens = tokensIn(blockAfter(css, selector));
    const own = tokens.get("--game-rack") as string;
    const other = tokens.get("--game-table") as string;
    expect(contrast(own, other)).toBeGreaterThanOrEqual(2.0);
  });

  it.each([
    ["light (:root)", ":root {"],
    ["dark (.dark)", ".dark {"],
  ])("%s: rack ink is readable on the rack", (_label, selector) => {
    const tokens = tokensIn(blockAfter(css, selector));
    const ink = tokens.get("--game-rack-ink") as string;
    const bg = tokens.get("--game-rack") as string;
    // 4.5:1 — normal-weight body text sits on this surface.
    expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

/** WCAG 2.1 relative-luminance contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const ch = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
