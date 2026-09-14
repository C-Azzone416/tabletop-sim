import { test, expect } from "@playwright/test";
import { seedGame, cleanupGame, gameUrl } from "./helpers";

// #432 — Wire Game's non-host mid-game leave: the client half. The mission
// ends but the room survives — remaining players land back in the SAME
// room's lobby, not /play (contrast with the host-leave case, already
// covered by room-entry-flow.spec.ts's "leaving a room" describe block).
//
// Two independent browser contexts, same pattern multiplayer-sync.spec.ts
// established: a second `page` in the same context would share the first
// player's cookie/session, not prove a genuinely separate connection.

test("a non-host leaving mid-game warns before confirming, ends the mission, and the room survives for everyone else", async ({
  page,
  browser,
}) => {
  const seed = await seedGame(1);
  const alice = seed.players.find((p) => p.name === "Alice");
  if (!alice) throw new Error("Seed response did not include an Alice profileId");

  // Dev (the captain) stays on the original page/context.
  await page.goto(gameUrl(seed));
  await expect(page.getByText("Your turn — choose an action")).toBeVisible({ timeout: 10_000 });

  // Alice (non-host) connects on a genuinely independent context.
  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await alicePage.goto(
    `${gameUrl(seed).split("?")[0]}?profileId=${alice.profileId}&playerName=Alice`,
  );
  await expect(alicePage.getByText("Waiting for Dev")).toBeVisible({ timeout: 10_000 });

  try {
    // Clicking Leave opens the warning rather than leaving immediately.
    await alicePage.getByRole("button", { name: "Leave" }).click();
    await expect(alicePage.getByRole("alertdialog")).toBeVisible();
    await expect(alicePage.getByText(/end the mission for everyone/i)).toBeVisible();

    // Cancel backs out — the game must still be live afterward, on both
    // pages, proving nothing happened server-side from opening the dialog.
    await alicePage.getByRole("button", { name: "Cancel" }).click();
    await expect(alicePage.getByRole("alertdialog")).toHaveCount(0);
    await expect(alicePage.getByText("Waiting for Dev")).toBeVisible();

    // Now the real thing: confirm.
    await alicePage.getByRole("button", { name: "Leave" }).click();
    await alicePage.getByRole("button", { name: "End the Mission" }).click();

    // Alice's own page never hears its own player_left/game_state — it
    // navigates immediately, same as the lobby's leave. Asserting it left
    // /game/:joinCode rather than the literal /play destination: this
    // dev-seeded page (query-param profileId, not a real NextAuth session)
    // has no session for /play's own auth gate to accept, so Next
    // redirects it on to "/" right after — real router.push("/play") still
    // fired, confirmed by the URL no longer being the game page at all.
    await expect(alicePage).not.toHaveURL(/\/game\//, { timeout: 10_000 });

    // Dev sees the interstitial naming Alice, not a bare reset to the lobby.
    await expect(page.getByText("Mission Ended")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Alice left/i)).toBeVisible();

    // Dismissing reveals the SAME room's lobby — not a navigation to /play,
    // and Alice's seat is genuinely gone (not a ghost entry), while Dev's
    // own seat is still there.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Mission Ended")).toHaveCount(0);
    await expect(page.getByText("Game Lobby")).toBeVisible();
    await expect(page).not.toHaveURL(/\/play$/);
    // exact:true — a substring match on "Dev" also matches the "[DEV]"
    // dev-tools toggle button's own label.
    await expect(page.getByText("Dev", { exact: true })).toBeVisible();
    await expect(page.getByText("Alice", { exact: true })).toHaveCount(0);
  } finally {
    await aliceContext.close();
    await cleanupGame(seed.joinCode);
  }
});
