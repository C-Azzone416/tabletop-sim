import { test, expect } from "@playwright/test";
import {
  seedGame,
  seedNearWinGame,
  cleanupGame,
  gameUrl,
  gameUrlWithSeats,
  findOpponentHiddenWireByColor,
  findLocalDuplicateValuePair,
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
    redWire = await findOpponentHiddenWireByColor(page, browser, seed, ["Alice", "Bob", "Carol"], "red");
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

// ── Test: Mission win condition ─────────────────────────────────────────────
//
// Unblocked by server PR #128's /dev/seed-near-win: rather than solving an
// arbitrary 24-wire/4-hand deal via a multi-identity turn-ordered sequence
// of solo + dual cuts (impractical to verify without a live server — see
// git history for the prior analysis), the endpoint positions the board one
// real action from victory — every wire cut except a matching non-red pair
// reassigned to Dev, with Dev's turn active. That leaves exactly the same
// solo-cut interaction wire-cutting.spec.ts already exercises, just with the
// server-side win check (checkWinCondition in game-engine.ts — every wire
// across all 4 players is "cut") landing on this specific submission.

test("mission win condition: all safe wires cleared shows Mission Complete overlay", async ({
  page,
}) => {
  const seed = await seedNearWinGame(1);
  try {
    // gameUrlWithSeats (not gameUrl): the #171 regression below needs the
    // DevPanel seat switcher populated, which only happens via the
    // seatOptions query param. Safe here — the game loads already active,
    // so the #149 setup→active auto-seat-follow never fires.
    await page.goto(gameUrlWithSeats(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    const dup = await findLocalDuplicateValuePair(page);
    if (!dup) {
      throw new Error(
        "Expected Dev's rack to contain the matching wire pair positioned by /dev/seed-near-win",
      );
    }

    await page.getByRole("button", { name: "Solo Cut" }).click();
    await dup.wires[0].click();
    await dup.wires[1].click();

    const confirmBtn = page.getByRole("button", { name: "Confirm Solo Cut" });
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();

    await expect(page.getByText("Mission Complete!")).toBeVisible({ timeout: 10_000 });

    // #171 regression: the dev panel must stay clickable while the game-over
    // overlay's full-screen backdrop is up (it used to sit underneath at
    // z-40 vs z-50, so these clicks would fail on pointer interception).
    // Switching to a non-captain seat is the exact flow Caroline was blocked
    // on — the reconnect-as-Alice round trip should land on the overlay's
    // waiting state instead of the captain's mission controls.
    await page.getByRole("button", { name: /Open dev tools/ }).click();
    await page.getByRole("button", { name: "Alice", exact: true }).click();
    await expect(
      page.getByText("Waiting for the captain to choose the next mission..."),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// ── Test: Continue playing — win into next mission (#157) ──────────────────
//
// Dev is always the captain in a /dev/seed-near-win game (game-engine.ts's
// createGame assigns the creator as captain). After a real win, the captain
// clicks "Next Mission" (GameOverOverlay's smart default, mission+1), which
// sends the next_mission WS message (server PR #168's executeNextMission —
// same game row, same join code, wires re-dealt, status back to setup) —
// confirming the whole client→server→client round trip, not just the UI.

test("continue playing: captain wins then starts the next mission, same join code", async ({
  page,
}) => {
  const seed = await seedNearWinGame(1);
  try {
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    const dup = await findLocalDuplicateValuePair(page);
    if (!dup) {
      throw new Error(
        "Expected Dev's rack to contain the matching wire pair positioned by /dev/seed-near-win",
      );
    }

    await page.getByRole("button", { name: "Solo Cut" }).click();
    await dup.wires[0].click();
    await dup.wires[1].click();
    await page.getByRole("button", { name: "Confirm Solo Cut" }).click();
    await expect(page.getByText("Mission Complete!")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Next Mission (2)" }).click();

    // Same game row (join code) transitions straight back into a fresh
    // setup/opening-token-placement flow for mission 2 — no lobby rebuild.
    await expect(
      page.getByText("Your turn — place your opening info token"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(seed.joinCode)).toBeVisible();
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
