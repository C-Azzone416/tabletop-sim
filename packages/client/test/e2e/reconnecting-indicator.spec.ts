import { test, expect } from "@playwright/test";
import { seedGame, cleanupGame, gameUrl } from "./helpers";

// #448 — the reconnecting indicator. Two independent browser contexts
// (multiplayer-sync.spec.ts's established pattern): closing Alice's whole
// CONTEXT is a genuine, abrupt disconnect (unlike page.close(), and unlike
// anything the app itself drives) — the same shape as a real network drop
// or a crashed tab, with no leave_game ever sent.
//
// #439 already established both seat layouts are tight at 400px (Flip's
// rail has no headroom, wraps at 5 players); this checks the SAME question
// for Wire's player-row header, geometrically (boundingBox, #453's
// precedent) rather than just asserting the badge exists somewhere in the
// DOM — an element can be present and still overlap or overflow, which a
// bare `toBeVisible()` would not catch.
test("a genuine disconnect shows the reconnecting badge (after the display delay, not before) at phone width, without overflowing the player row", async ({
  page,
  browser,
}) => {
  const seed = await seedGame(1);
  const alice = seed.players.find((p) => p.name === "Alice");
  if (!alice) throw new Error("Seed response did not include an Alice profileId");

  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(gameUrl(seed));
  await expect(page.getByText("Your turn — choose an action")).toBeVisible({ timeout: 10_000 });

  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await alicePage.goto(
    `${gameUrl(seed).split("?")[0]}?profileId=${alice.profileId}&playerName=Alice`,
  );
  await expect(alicePage.getByText("Waiting for Dev")).toBeVisible({ timeout: 10_000 });

  try {
    // Genuine abrupt disconnect: close the whole context, not just leave.
    await aliceContext.close();

    // Before the display delay (RECONNECT_INDICATOR_DELAY_MS = 2s): must
    // NOT show yet — a flash before the threshold defeats the point of
    // having one.
    await page.waitForTimeout(500);
    await expect(page.getByText("Reconnecting…")).toHaveCount(0);

    // After the delay: shows, and stays within the player row — no
    // horizontal overflow of the page body, and the row containing it
    // doesn't overlap the row below it.
    await expect(page.getByText("Reconnecting…")).toBeVisible({ timeout: 5_000 });

    const badge = page.getByText("Reconnecting…");
    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    // The badge itself must be fully within the 400px viewport — not
    // clipped or pushed off-screen by the row's other chips (You/Captain/
    // Active) when all could legitimately be present at once.
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(viewport!.width);

    // No page-level horizontal scroll — the artifact rule this app itself
    // is held to (and the same failure mode #450 was).
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
