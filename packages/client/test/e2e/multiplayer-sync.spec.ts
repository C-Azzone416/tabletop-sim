import { test, expect } from "@playwright/test";
import { MISSION_CONFIGS } from "@tabletop/shared";
import { seedGame, cleanupGame, gameUrl } from "./helpers";

// #187: others' hidden wires arrive color-redacted, so pre-action red
// counts only cover the viewer's own (randomly dealt) reds. The
// deterministic cross-player number is the mission config's red total,
// asserted after reveal (revealed wires ship color on every rack).
const TOTAL_REDS = MISSION_CONFIGS[5].wireGroups
  .filter((g) => g.color === "red")
  .reduce((n, g) => n + g.values.length * g.copiesPerValue, 0);

// ── Test: Multiplayer state sync across 2 players ──────────────────────────
//
// Unblocked by server PR #107: /dev/seed's `players` array now returns a
// real profileId for every seeded player, so a second browser context
// (independent cookie/storage — browser.newContext(), not just a second
// page in the same context) can be authenticated as a genuinely different
// seat (Alice) rather than reconnecting as Dev. Two sockets for the SAME
// playerId would silently overwrite each other in connection-manager.ts's
// gameConnections map — this test needs two DISTINCT playerIds to prove
// real broadcast fan-out, which is now possible.
//
// Action used: Reveal Reds (mission 5). It's a good sync probe because it
// mutates state for every player at once (wiresDb.revealRedWires flips every
// hidden red wire across ALL 4 hands, not just the acting player's) and also
// advances the turn (executeRevealReds → advanceTurn), so the test can
// assert two independent facts land on the second context purely via the WS
// broadcast, with no reload:
//   1. Every previously-hidden red wire — including ones Alice's own page is
//      rendering that belong to OTHER players — flips to "revealed".
//   2. The turn indicator on Alice's page flips from "Waiting for Dev…" to
//      "Your turn…", since players are dealt/turn-ordered captain-first
//      (Dev) then join order (Alice next) — see advanceTurn in
//      packages/server/src/engine/game-engine.ts.

test("state changes from one player's action are visible to other connected players in real time", async ({
  page,
  browser,
}) => {
  const seed = await seedGame(5);
  const alice = seed.players.find((p) => p.name === "Alice");
  if (!alice) throw new Error("Seed response did not include an Alice profileId");

  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();

  try {
    // Dev's page — will take the action.
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    // Alice's independent session — should start out watching Dev's turn.
    await alicePage.goto(
      gameUrl({ ...seed, profileId: alice.profileId, playerName: alice.name }),
    );
    await expect(alicePage.locator('[data-testid="player-rack"]')).toHaveCount(4, {
      timeout: 10_000,
    });
    await expect(alicePage.getByText("Waiting for Dev...")).toBeVisible({
      timeout: 10_000,
    });

    const hiddenRedsOnAlicePage = alicePage.locator(
      'button[data-wire-color="red"][data-wire-status="hidden"]',
    );
    const revealedRedsOnAlicePage = alicePage.locator(
      'button[data-wire-color="red"][data-wire-status="revealed"]',
    );
    await expect(revealedRedsOnAlicePage).toHaveCount(0);

    // Dev takes the action on their own page.
    await page.getByRole("button", { name: "Reveal Reds" }).click();

    // Alice's page — untouched, never reloaded — reflects both the wire
    // state change and the turn change purely via WS broadcast. All of the
    // mission's reds are now revealed (color visible on every rack).
    await expect(revealedRedsOnAlicePage).toHaveCount(TOTAL_REDS, { timeout: 10_000 });
    await expect(hiddenRedsOnAlicePage).toHaveCount(0);
    await expect(alicePage.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await aliceContext.close();
    await cleanupGame(seed.joinCode);
  }
});
