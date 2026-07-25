import { test, expect } from "@playwright/test";
import {
  seedSoloCutLegalGame,
  cleanupGame,
  gameUrl,
} from "./helpers";

// ── Test: Solo cut — safe outcome ──────────────────────────────────────────
//
// Solo Cut requires selecting 2 wires from the LOCAL player's own rack that
// share the same value (GameBoard.soloCutMatchStatus / ActionPanel gate
// "Confirm Solo Cut" behind status === "valid"). #165: /dev/seed-solo-cut-legal
// deterministically reassigns all 4 copies of one value to Dev server-side
// (mission 1 splits each value's 4 copies across 4 players, so a random
// /dev/seed deal gives this by chance with <1% probability), replacing the
// old 5-attempt retry+skip loop that mostly skipped instead of exercising
// the scenario.

test("solo cut on two matching-value wires succeeds and cuts both wires", async ({
  page,
}) => {
  const seed = await seedSoloCutLegalGame(1);
  await page.goto(gameUrl(seed));
  await expect(page.getByText("Your turn — choose an action")).toBeVisible({
    timeout: 10_000,
  });

  try {
    // No [data-wire-status="hidden"] in the selector itself: Playwright
    // locators re-evaluate their selector on every action, so a status
    // baked into the query would stop matching wireA/wireB the instant the
    // solo cut flips them to "cut" below, breaking the toBeDisabled/
    // data-wire-status assertions after that point (status here is only a
    // startup sanity check, done via a fresh query, not embedded in the
    // Locator we keep using).
    const rack = page.locator('[data-testid="player-rack"]').first();
    const matchingWires = rack
      .locator('button[data-wire-position]')
      .filter({ hasText: new RegExp(`^${seed.soloCutValue}$`) });
    await expect(matchingWires).toHaveCount(4, { timeout: 10_000 });
    await expect(
      rack.locator('button[data-wire-position][data-wire-status="hidden"]').filter({ hasText: new RegExp(`^${seed.soloCutValue}$`) }),
    ).toHaveCount(4);
    const wireA = matchingWires.nth(0);
    const wireB = matchingWires.nth(1);

    await page.getByRole("button", { name: "Solo Cut" }).click();
    await wireA.click();
    await wireB.click();

    const confirmBtn = page.getByRole("button", { name: "Confirm Solo Cut" });
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();

    await expect(page.getByText("Wire cut successfully!")).toBeVisible({
      timeout: 10_000,
    });

    // Cut wires render disabled (Wire.tsx: disabled={!onSelect || isCut})
    // and expose data-wire-status="cut".
    await expect(wireA).toBeDisabled({ timeout: 5_000 });
    await expect(wireB).toBeDisabled();
    await expect(wireA).toHaveAttribute("data-wire-status", "cut");
    await expect(wireB).toHaveAttribute("data-wire-status", "cut");
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// ── Test: Solo cut — wrong/loss outcome (BLOCKED) ──────────────────────────
//
// Not implementable against the current client: the Solo Cut UI only enables
// "Confirm Solo Cut" once the two selected wires already share a value
// (packages/client/app/components/ActionPanel.tsx — disabled={soloCutMatchStatus
// !== "valid"}; packages/client/app/components/GameBoard.tsx —
// soloCutMatchStatus()). A player's own hidden wire values are always visible
// to them (state-broadcaster.ts's buildPlayerView only redacts OTHER players'
// hidden wires), so any value submittable via the UI is guaranteed to match
// at least the selected wire itself. Server-side, executeSoloCut
// (packages/server/src/engine/game-engine.ts) treats
// matchingWires.length > 0 as success — so that value will always resolve
// "success", never a wrong/loss outcome. This matches the existing unit test
// packages/client/test/GameBoard.test.tsx "solo_cut: selecting 2 mismatched
// wires shows error and disables confirm", which shows mismatched selections
// are blocked before they ever reach the server. Testing a genuine solo-cut
// failure would need either a UI change (e.g. a free-text value guess) or a
// dedicated dev endpoint that seeds a hand with a stale duplicate — flagging
// for product/backend rather than guessing at an implementation.
//
// Checklist item 4 ("wrong/loss outcome coverage") is now satisfied instead
// by dual-cut.spec.ts's "target denies a wrong guess" test, per the
// 2026-07-22 23:14 turn-structure ruling (#decisions) reframing the wrong-
// outcome path around dual_cut's deny flow rather than solo_cut, which
// remains structurally unreachable for this specific case.
test.skip("solo cut with a wrong/no-match value advances the detonator", () => {});
