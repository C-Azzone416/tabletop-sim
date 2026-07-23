import { test, expect } from "@playwright/test";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findDualCutOpportunity,
  findDualCutWrongGuessOpportunity,
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
      .getByRole("button", { name: `Wire #${opp.ownWireRackPosition}` })
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

// ── Test: Dual cut — wrong outcome (deny path) ─────────────────────────────
//
// Re-scoped E2E checklist item 4 (#decisions, 2026-07-22 23:14 ruling): a
// genuine wrong/loss outcome is no longer solo_cut's job (structurally
// unreachable there — see wire-cutting.spec.ts) but IS reachable through
// dual_cut's deny path, which the server already fully supports today
// (executeRespondDualCut's accepted=false branch: blue/yellow → info token +
// detonator advance, red → immediate loss — packages/server/src/engine/game-
// engine.ts).
//
// The proposer guesses a value it actually holds (satisfying #133's
// propose-time must-hold guard) that does NOT match the target's real value
// (findDualCutWrongGuessOpportunity — reads both from the DOM, same
// info-token technique as findDualCutOpportunity), and the target denies.
// An earlier version of this test picked the wrong value by cycling the
// real value by an offset without checking whether Dev actually held it —
// intermittently tripped the must-hold guard and hung waiting on a target
// prompt the server never sent (flagged by daring-bobcat during #136).
// Only a blue wire is used — red would end the mission before we can assert
// the detonator advanced, and that path is exercised by win-loss.spec.ts.

test("dual cut: target denies a wrong guess — detonator advances", async ({
  page,
  browser,
}) => {
  let seed: SeedResult | null = null;
  let found: Awaited<ReturnType<typeof findDualCutWrongGuessOpportunity>> = null;

  for (let attempt = 0; attempt < 5 && !found; attempt++) {
    if (seed) await cleanupGame(seed.joinCode);
    seed = await seedGame(1);
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });
    found = await findDualCutWrongGuessOpportunity(page, ["Alice", "Bob", "Carol"]);
  }

  if (!seed) throw new Error("Failed to seed game");

  if (!found) {
    await cleanupGame(seed.joinCode);
    test.skip(
      true,
      "Could not find a Dev-held blue value distinct from any opponent's hidden blue wire across 5 random /dev/seed deals — rare but possible given mission 1's random deal",
    );
    return;
  }

  const targetProfile = seed.players.find((p) => p.name === found!.ownerName);
  if (!targetProfile) {
    await cleanupGame(seed.joinCode);
    throw new Error(`No seeded profile found for ${found.ownerName}`);
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

    const detonatorBefore = await page.getByText(/^\d+ \/ \d+$/).textContent();

    await page.getByRole("button", { name: "Dual Cut" }).click();
    await found.wire.click();
    await expect(page.getByText(/Guess the value of/i)).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder("Enter value…").fill(found.wrongValue);
    await page.getByRole("button", { name: "Propose Cut" }).click();

    await expect(
      targetPage.getByText(/guesses your wire.*has value/i),
    ).toBeVisible({ timeout: 10_000 });
    await targetPage.getByRole("button", { name: "No" }).click();

    await expect(page.getByText("Wrong guess — detonator advances!")).toBeVisible({
      timeout: 10_000,
    });

    // Lives remaining decrements by exactly one on both real sessions (#143:
    // the display counts DOWN — the underlying detonatorPosition still
    // advances by one, but the UI transform inverts that into lives lost).
    const detonatorAfter = page.getByText(/^\d+ \/ \d+$/);
    await expect(detonatorAfter).not.toHaveText(detonatorBefore ?? "", {
      timeout: 5_000,
    });
    const [beforeN] = (detonatorBefore ?? "0 / 0").split(" / ").map(Number);
    const [afterN] = (await detonatorAfter.textContent())!.split(" / ").map(Number);
    expect(afterN).toBe(beforeN - 1);

    // The wire itself is untouched — deny places an info token, not a cut.
    await expect(found.wire).toHaveAttribute("data-wire-status", "hidden");
  } finally {
    await targetContext.close();
    await cleanupGame(seed.joinCode);
  }
});
