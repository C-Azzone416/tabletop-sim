import { test, expect } from "@playwright/test";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findOpponentHiddenWireByColor,
  type SeedResult,
} from "./helpers";

// ── Test: Mission loss — dual cut wrong guess on a red wire ────────────────
//
// Unblocked by server PR #107: driving a real second WS identity lets the
// wire's actual owner respond to a dual cut proposal, which is required to
// reach the "wrong guess" branch of executeRespondDualCut
// (packages/server/src/engine/game-engine.ts) — that function takes the
// responder's own `accepted: boolean` at face value and never re-validates
// it against the wire's true value, so a real owner clicking "No" always
// takes the fail path regardless of what the proposer actually guessed.
//
// For a RED wire specifically, that fail path is an immediate loss with no
// detonator math involved: "Red wrong guess = immediate game over" cuts
// straight to `gamesDb.updateGameStatus(gameId, 'lost')`. That makes this
// the single most direct reachable LOSS path — one proposal, one "No", no
// multi-turn detonator grinding required. (The other loss path analyzed
// previously — a wrong blue/yellow dual cut advancing the detonator to max —
// is also technically reachable now, but needs several played-out turns
// across all 4 real identities to actually hit detonatorMax and is left for
// a follow-up rather than duplicated here.)
//
// Mission 5 is used because it's the first mission with red wires
// (MISSION_5_CONFIG). Which opponent (if any) actually holds a red wire is
// random per deal (wire-dealer.ts shuffles the full deck before splitting
// hands), so this retries a few seeds and skips only if none of the 3 real
// non-Dev seats ends up holding one — vanishingly unlikely with 4 red wires
// dealt across 4 hands, but not impossible.

test("mission loss condition: wrong dual cut guess on a red wire shows Mission Failed overlay", async ({
  page,
  browser,
}) => {
  let seed: SeedResult | null = null;
  let redWire: Awaited<ReturnType<typeof findOpponentHiddenWireByColor>> = null;

  for (let attempt = 0; attempt < 5 && !redWire; attempt++) {
    if (seed) await cleanupGame(seed.joinCode);
    seed = await seedGame(5);
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });
    redWire = await findOpponentHiddenWireByColor(page, ["Alice", "Bob", "Carol"], "red");
  }

  if (!seed) throw new Error("Failed to seed game");

  if (!redWire) {
    await cleanupGame(seed.joinCode);
    test.skip(
      true,
      "None of Alice/Bob/Carol ended up holding a hidden red wire across 5 random /dev/seed deals",
    );
    return;
  }

  const targetProfile = seed.players.find((p) => p.name === redWire!.ownerName);
  if (!targetProfile) {
    await cleanupGame(seed.joinCode);
    throw new Error(`No seeded profile found for ${redWire.ownerName}`);
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

    // Propose a dual cut on the red wire — the guessed value doesn't matter,
    // since the target is about to decline regardless (see comment above).
    await page.getByRole("button", { name: "Dual Cut" }).click();
    await redWire.wire.click();
    await expect(page.getByText(/Guess the value of/i)).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder("Enter value…").fill("9");
    await page.getByRole("button", { name: "Propose Cut" }).click();

    await expect(
      targetPage.getByText(/guesses your wire.*has value/i),
    ).toBeVisible({ timeout: 10_000 });
    await targetPage.getByRole("button", { name: "No" }).click();

    // Red wrong guess is an immediate loss — Mission Failed overlay shows on
    // BOTH real WS sessions via the game_over broadcast.
    await expect(page.getByText("Mission Failed")).toBeVisible({ timeout: 10_000 });
    await expect(targetPage.getByText("Mission Failed")).toBeVisible({ timeout: 10_000 });
  } finally {
    await targetContext.close();
    await cleanupGame(seed.joinCode);
  }
});

// ── Test: Mission win condition (BLOCKED — impractical, not infeasible) ────
//
// PR #107 removed the identity blocker, but full mission completion is a
// different problem: checkWinCondition (game-engine.ts) requires EVERY wire
// across ALL 4 players to be "cut", and mission 1 — the smallest config in
// MISSION_CONFIGS (packages/shared/src/constants.ts) — still deals 24 wires
// (6 per player in a 4-player game). Solo Cut only clears duplicate-value
// pairs already sitting in a player's own rack; any wire without a same-
// value partner in its owner's hand can only be cleared via a *completed*
// Dual Cut, which itself is a 3-step handshake across two real identities
// (see dual-cut.spec.ts) and additionally requires the completing player to
// hold a legal own-wire (matching value for blue, matching color for
// yellow) to submit.
//
// Driving this to completion would mean programmatically solving, sight
// unseen, an arbitrary random 24-wire/4-hand deal into a sequence of solo
// cuts and 3-step dual cuts, strictly alternating turns
// (advanceTurn/currentTurnPlayerId) across 4 real browser contexts, with no
// live server available in this environment to execute and debug the
// resulting flow. That's a meaningfully different (and much riskier) test
// than driving one fixed interaction — a bug in the pairing/turn-order logic
// wouldn't fail loudly, it would just hang waiting on a popup that never
// appears.
//
// Recommendation for a tractable version of this test: a dev endpoint that
// seeds a near-won board (e.g. all wires cut but one duplicate pair) so the
// test only has to drive the last 1-2 real actions rather than solve the
// whole mission. Flagging for backend/product rather than shipping an
// unverified multi-turn solver.

test.skip("mission win condition: all safe wires cleared shows Mission Complete overlay", () => {});
