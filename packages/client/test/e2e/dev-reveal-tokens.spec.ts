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

test("[DEV] Reveal All Tokens button fast-forwards a fresh setup-phase game to fully tokened", async ({
  page,
}) => {
  const seed = await seedRaw(1);
  try {
    await page.goto(gameUrl(seed));

    await expect(
      page.getByRole("heading", { name: "Place Your Opening Info Token" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="wire-info-token"]')).toHaveCount(0);

    const btn = page.getByText("[DEV] Reveal All Tokens");
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
