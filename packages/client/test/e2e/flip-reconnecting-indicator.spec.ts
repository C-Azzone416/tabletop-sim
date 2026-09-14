import { test, expect } from "@playwright/test";
import { seedFlipGame, flipGameUrl } from "./flip-helpers";

// #448 — Flip's half of the reconnecting indicator. Same protocol as
// reconnecting-indicator.spec.ts (Wire's half); this checks it lands
// correctly in SeatRail specifically, and #439's own "no headroom at
// 400px" constraint still holds with the badge added.
test("a genuine disconnect shows the reconnecting badge in Flip's seat rail after the display delay, at phone width", async ({
  page,
  browser,
}) => {
  const seed = await seedFlipGame(4);
  const dev = seed.players[0]!;
  const alice = seed.players[1]!;

  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(flipGameUrl(seed, dev.name, dev.profileId));
  await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await alicePage.goto(flipGameUrl(seed, alice.name, alice.profileId));
  await expect(alicePage.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

  try {
    await aliceContext.close();

    await page.waitForTimeout(500);
    await expect(page.getByText("Reconnecting…")).toHaveCount(0);

    await expect(page.getByText("Reconnecting…")).toBeVisible({ timeout: 5_000 });

    // Lands in the seat rail specifically, next to Alice's own seat.
    const rail = page.getByTestId("seat-rail");
    await expect(rail).toContainText("Reconnecting…");
    await expect(rail).toContainText(alice.name);

    // #439's constraint: no page-level horizontal overflow at 400px, badge
    // included.
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  } finally {
    await aliceContext.close().catch(() => {});
  }
});
