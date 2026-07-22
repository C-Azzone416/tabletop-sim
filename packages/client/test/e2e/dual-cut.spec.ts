import { test, expect } from "@playwright/test";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findDualCutOpportunity,
  type SeedResult,
} from "./helpers";

// ── Test: Dual cut — full 2-player success flow ────────────────────────────
//
// Unblocked by server PR #107: /dev/seed's `players` array now returns a
// real profileId for every seeded player (Dev/Alice/Bob/Carol), so a second
// browser context can be authenticated as the actual target player rather
// than only Dev (see helpers.ts's gameUrl() and playerContainer()).
//
// Dual cut is a 3-step handshake across TWO real WS sessions:
//   1. Proposer clicks an opponent's hidden wire and guesses its value
//      (GameBoard.handleOpponentWireClick → propose_dual_cut →
//      executeProposeDualCut in game-engine.ts).
//   2. The wire's owner sees a Yes/No popup (GameBoard's isTarget block) and
//      responds (respond_dual_cut). Accepting reveals the wire
//      (status → "revealed") and prompts the proposer to complete their
//      half (dual_cut_correct broadcast).
//   3. The proposer picks one of their own hidden wires to cut alongside it
//      (complete_dual_cut → executeCompleteDualCut), which requires the
//      value to match (blue wires) or the color to match (yellow wires).
//
// Since /dev/seed pre-places an info token on every wire for every player
// (seedDevGame in packages/server/src/app.ts), the true value of an
// opponent's hidden wire is readable from that wire's info-token badge
// (Wire.tsx's data-testid="wire-info-token") even though the wire's own
// value field is redacted server-side. findDualCutOpportunity() uses this
// to find a value shared between Dev's own rack and an opponent's rack, so
// the proposed guess is guaranteed correct and the completion step is
// guaranteed to have a legal own-wire to submit — no server-side knowledge
// required, only what's already rendered in the DOM.

test("dual cut: propose, target accepts, proposer completes — cuts both wires", async ({
  page,
  browser,
}) => {
  let seed: SeedResult | null = null;
  let opp: Awaited<ReturnType<typeof findDualCutOpportunity>> = null;

  for (let attempt = 0; attempt < 5 && !opp; attempt++) {
    if (seed) await cleanupGame(seed.joinCode);
    seed = await seedGame(1);
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });
    opp = await findDualCutOpportunity(page, ["Alice", "Bob", "Carol"]);
  }

  if (!seed) throw new Error("Failed to seed game");

  if (!opp) {
    await cleanupGame(seed.joinCode);
    test.skip(
      true,
      "Could not find a wire value shared between Dev's rack and any opponent's rack across 5 random /dev/seed deals — rare but possible given mission 1's random deal",
    );
    return;
  }

  const targetProfile = seed.players.find((p) => p.name === opp!.targetPlayerName);
  if (!targetProfile) {
    await cleanupGame(seed.joinCode);
    throw new Error(`No seeded profile found for ${opp.targetPlayerName}`);
  }

  const targetContext = await browser.newContext();
  const targetPage = await targetContext.newPage();

  try {
    await targetPage.goto(
      gameUrl({ ...seed, profileId: targetProfile.profileId, playerName: targetProfile.name }),
    );
    await expect(targetPage.locator('[data-testid="player-rack"]')).toHaveCount(4, {
      timeout: 10_000,
    });

    // Step 1: Dev proposes a dual cut on the opponent's wire, guessing the
    // value read from its info token badge.
    await page.getByRole("button", { name: "Dual Cut" }).click();
    await opp.targetWire.click();
    await expect(page.getByText(/Guess the value of/i)).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder("Enter value…").fill(opp.value);
    await page.getByRole("button", { name: "Propose Cut" }).click();

    // Step 2: target sees the incoming guess and accepts it.
    await expect(
      targetPage.getByText(/guesses your wire.*has value/i),
    ).toBeVisible({ timeout: 10_000 });
    await targetPage.getByRole("button", { name: "Yes" }).click();

    // Step 3: proposer's page shows "Correct Guess!" and completes with the
    // matching own wire.
    await expect(page.getByText("Correct Guess!")).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole("button", { name: `Wire #${opp.ownWireRackPosition + 1}` })
      .click();

    await expect(page.getByText("Wire cut successfully!")).toBeVisible({
      timeout: 10_000,
    });

    // Both wires — the opponent's target wire and Dev's own completing wire
    // — are now cut, and this is visible on BOTH real WS sessions.
    await expect(opp.targetWire).toHaveAttribute("data-wire-status", "cut", {
      timeout: 5_000,
    });
    await expect(opp.ownWire).toHaveAttribute("data-wire-status", "cut");
    await expect(
      targetPage.locator('button[data-wire-status="cut"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await targetContext.close();
    await cleanupGame(seed.joinCode);
  }
});
