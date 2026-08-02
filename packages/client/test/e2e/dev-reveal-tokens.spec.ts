import { test, expect, request } from "@playwright/test";
import { API_URL, cleanupGame, gameUrl, type SeedResult } from "./helpers";

// Deliberately bypasses the shared seedGame() helper: per #dev-seed-realism,
// that helper fast-forwards (seed + reveal-all-tokens) to preserve existing
// specs that assume an active, fully-tokened game. This test needs the RAW
// /dev/seed default instead — setup phase, zero pre-placed tokens — since
// that's exactly the state the reveal button is meant to fast-forward past.
async function seedRaw(mission = 1): Promise<SeedResult> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/seed", { data: { mission } });
  if (!res.ok()) throw new Error(`Seed failed: ${res.status()}`);
  return res.json();
}

test("Reveal All Tokens (dev panel) fast-forwards a fresh setup-phase game to fully tokened", async ({
  page,
}) => {
  const seed = await seedRaw(1);
  try {
    await page.goto(gameUrl(seed));

    await expect(
      page.getByRole("heading", { name: "Place Your Opening Info Token" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Open dev tools" }).click();
    const btn = page.getByText("Reveal All Tokens");
    await expect(btn).toBeVisible();
    await btn.click();

    // Every wire across all 4 racks now carries an info-token badge.
    const wireCount = await page.locator('button[data-wire-position]').count();
    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(
      wireCount,
      { timeout: 10_000 },
    );
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// #172: Reveal All Tokens becomes "Hide Dev Tokens" once dev-created tokens
// are present (state-derived — see GameClient.tsx's devTokensRevealed —
// not tracked as local click state), and clicking it undoes the reveal via
// bobcat's #184 server piece (POST /dev/hide-dev-tokens).
test("Hide Dev Tokens undoes a Reveal All, and the button toggles back", async ({
  page,
}) => {
  const seed = await seedRaw(1);
  try {
    await page.goto(gameUrl(seed));
    await expect(
      page.getByRole("heading", { name: "Place Your Opening Info Token" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Open dev tools" }).click();
    await page.getByText("Reveal All Tokens").click();

    const wireCount = await page.locator('button[data-wire-position]').count();
    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(
      wireCount,
      { timeout: 10_000 },
    );

    const hideBtn = page.getByText("Hide Dev Tokens");
    await expect(hideBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Reveal All Tokens")).not.toBeVisible();
    await hideBtn.click();

    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByText("Reveal All Tokens")).toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// #253 gap list — decimal token values must round-trip through
// /dev/reveal-all-tokens without truncation. Mission 5 is the first with
// yellow (.1 suffix) and red (.5 suffix) wires, and #220's guarantee means
// exactly one of each is always dealt, regardless of who ends up holding
// them — so this is deterministic, no retry loop needed.
//
// Wire.tsx's data-wire-value attribute comes from the info token's value
// for ANY wire with a pending token (own or an opponent's — infoTokens are
// public knowledge, unlike the wire's own redacted color/value fields), so
// scanning every wire on the board (not just the local player's own rack)
// finds both decimal wires regardless of who was dealt them.
test("Reveal All Tokens round-trips decimal yellow/red values without truncation", async ({
  page,
}) => {
  const seed = await seedRaw(5);
  try {
    await page.goto(gameUrl(seed));
    await expect(
      page.getByRole("heading", { name: "Place Your Opening Info Token" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Open dev tools" }).click();
    await page.getByText("Reveal All Tokens").click();

    const wireButtons = page.locator('button[data-wire-position]');
    const wireCount = await wireButtons.count();
    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(
      wireCount,
      { timeout: 10_000 },
    );

    const values: string[] = [];
    for (let i = 0; i < wireCount; i++) {
      const v = await wireButtons.nth(i).getAttribute("data-wire-value");
      if (v) values.push(v);
    }

    // A truncated/rounded value would show up as a bare integer here
    // instead — the whole point of the regex match is that it fails if
    // the decimal suffix got dropped anywhere between server and DOM.
    const yellowDecimals = values.filter((v) => /^\d+\.1$/.test(v));
    const redDecimals = values.filter((v) => /^\d+\.5$/.test(v));
    expect(yellowDecimals, `all wire values: ${values.join(", ")}`).toHaveLength(1);
    expect(redDecimals, `all wire values: ${values.join(", ")}`).toHaveLength(1);
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
