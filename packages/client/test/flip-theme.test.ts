import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// #364: Flip's card colors get their own --flip-* namespace specifically so
// they can never repeat the #245 defect — a rule-bearing object colour
// (there, a wire) silently sharing a hex with a seat/"yours" token. This
// asserts the same property here: no --flip-* value may share a hex with a
// --wire-* or --p1..--p5 value in the same colour scheme. Text-level check
// against the source files, same rationale as theme.test.ts: the defect
// lives in the token file, not in anything a jsdom render could see.

const THEME = path.resolve(__dirname, "../styles/theme.css");
const FLIP = path.resolve(__dirname, "../styles/games/flip.css");

function tokensIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
    out.set(m[1], m[2].toUpperCase());
  }
  return out;
}

function blockAfter(src: string, selector: string): string {
  const start = src.indexOf(selector);
  expect(start, `selector ${selector} missing`).toBeGreaterThan(-1);
  let i = src.indexOf("{", start);
  let depth = 0;
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced block for ${selector}`);
}

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

const themeCss = readFileSync(THEME, "utf8");
const flipCss = readFileSync(FLIP, "utf8");

// (theme.css selector, flip.css selector) pairs — same scheme on both sides.
// Flip has no OS-preference duplicate block of its own; it inherits dark via
// the shared `.dark` class the same way its `.dark [data-game="flip"]` rule
// is written, so only two schemes exist to check here.
const SCHEMES: Array<[string, string, string]> = [
  ["light", ":root {", '[data-game="flip"] {'],
  ["dark", ".dark {", '.dark [data-game="flip"] {'],
];

const SEAT_AND_WIRE_TOKENS = [
  "--wire-blue",
  "--wire-yellow",
  "--wire-red",
  "--p1",
  "--p2",
  "--p3",
  "--p4",
  "--p5",
  "--game-concealed",
  "--game-revealed",
];

const FLIP_FILL_TOKENS = [
  ...Array.from({ length: 13 }, (_, i) => `--flip-num-${i}`),
  "--flip-boost",
  "--flip-freeze",
  "--flip-flip3",
  "--flip-second-chance",
];

describe("flip.css — card colours own a disjoint namespace from --wire-*/--p* (#364)", () => {
  for (const [label, themeSelector, flipSelector] of SCHEMES) {
    const themeTokens = tokensIn(blockAfter(themeCss, themeSelector));
    const flipTokens = tokensIn(blockAfter(flipCss, flipSelector));

    it(`${label}: no --flip-* fill shares a hex with a wire or seat token`, () => {
      const reserved = new Map(
        SEAT_AND_WIRE_TOKENS.map((t) => {
          const hex = themeTokens.get(t);
          expect(hex, `${t} missing from theme.css (${label})`).toBeDefined();
          return [hex as string, t];
        }),
      );

      const collisions = FLIP_FILL_TOKENS.flatMap((t) => {
        const hex = flipTokens.get(t);
        expect(hex, `${t} missing from flip.css (${label})`).toBeDefined();
        const owner = reserved.get(hex as string);
        return owner ? [`${t} (${hex}) === ${owner}`] : [];
      });

      expect(collisions, `${label}: a Flip card colour collides with a wire/seat colour`).toEqual([]);
    });

    it(`${label}: no two Flip fills are byte-identical`, () => {
      const seen = new Map<string, string>();
      const dupes: string[] = [];
      for (const t of FLIP_FILL_TOKENS) {
        const hex = flipTokens.get(t) as string;
        const prior = seen.get(hex);
        if (prior) dupes.push(`${t} === ${prior} (${hex})`);
        else seen.set(hex, t);
      }
      expect(dupes, `${label}: two Flip tokens share the exact same hex`).toEqual([]);
    });

    it(`${label}: every Flip fill's ink clears 3:1 (large/bold numeral text)`, () => {
      const failures = FLIP_FILL_TOKENS.flatMap((t) => {
        const fill = flipTokens.get(t) as string;
        const ink = flipTokens.get(`${t}-ink`);
        expect(ink, `${t}-ink missing from flip.css (${label})`).toBeDefined();
        const ratio = contrast(fill, ink as string);
        return ratio < 3.0 ? [`${t}: ${ink} on ${fill} = ${ratio.toFixed(2)}:1`] : [];
      });
      expect(failures, `${label}: ink fails 3:1 large-text contrast on its own fill`).toEqual([]);
    });
  }
});
