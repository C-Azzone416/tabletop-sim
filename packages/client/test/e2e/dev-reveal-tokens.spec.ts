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
