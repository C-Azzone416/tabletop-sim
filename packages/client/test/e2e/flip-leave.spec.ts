import { test, expect } from "@playwright/test";
import { seedFlipGame, flipGameUrl } from "./flip-helpers";

// #434 — Flip's non-host mid-game leave: the client half. Deliberately
// LIGHTER than Wire's #432 — play continues, nobody is moved, and the only
// visible sign for the remaining players is the departed seat's live
// "Left" badge, not a blocking interstitial (contrast with
// wire-leave.spec.ts's MissionEndedNotice case).
//
// Two independent browser contexts, same pattern wire-leave.spec.ts and
// multiplayer-sync.spec.ts established: a second `page` in the same
// context would share the first player's session, not prove a genuinely
// separate connection.

test("a non-host leaving mid-game gets a plain confirm, play continues, and the departed seat shows Left live for everyone else", async ({
  page,
  browser,
}) => {
  const seed = await seedFlipGame(4);
  const dev = seed.players[0]!;
  const alice = seed.players[1]!;

  // Dev (the captain) stays on the original page/context.
  await page.goto(flipGameUrl(seed, dev.name, dev.profileId));
  await expect(page.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

  // Alice (non-host) connects on a genuinely independent context.
  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await alicePage.goto(flipGameUrl(seed, alice.name, alice.profileId));
  await expect(alicePage.getByTestId("play-surface")).toBeVisible({ timeout: 10_000 });

  try {
    // Clicking Leave opens the confirm rather than leaving immediately.
    await alicePage.getByRole("button", { name: "Leave" }).click();
    await expect(alicePage.getByRole("alertdialog")).toBeVisible();
    await expect(alicePage.getByText(/play continues for everyone else/i)).toBeVisible();

    // Cancel backs out — the table must still be live on both pages after.
    await alicePage.getByRole("button", { name: "Cancel" }).click();
    await expect(alicePage.getByRole("alertdialog")).toHaveCount(0);
    await expect(alicePage.getByTestId("play-surface")).toBeVisible();

    // Now the real thing: confirm. The dialog's own button shares the
    // "Leave" label with the trigger — scope to the dialog.
    await alicePage.getByRole("button", { name: "Leave" }).click();
    await alicePage.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();

    // Alice's own page never hears its own broadcast — same pattern as
    // Wire's leave (wire-leave.spec.ts): it navigates away regardless of
    // /play's own auth gate for this dev-seeded (no real session) context.
    await expect(alicePage).not.toHaveURL(/\/game\//, { timeout: 10_000 });

    // Dev's page: no interstitial at all (play continues — this is the
    // whole point of #434 being lighter than #432), just the live seat
    // rail update naming Alice as departed.
    await expect(page.getByText("Mission Ended")).toHaveCount(0);
    await expect(page.getByText("Room Closed")).toHaveCount(0);
    const rail = page.getByTestId("seat-rail");
    await expect(rail).toContainText("Left", { timeout: 10_000 });
    await expect(rail).toContainText(alice.name);

    // Dev can still act — the table genuinely continues, nobody was moved.
    await expect(page.getByTestId("play-surface")).toBeVisible();
  } finally {
    await aliceContext.close();
  }
});
