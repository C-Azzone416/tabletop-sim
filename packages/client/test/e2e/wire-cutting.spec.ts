import { test, expect } from "@playwright/test";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findLocalDuplicateValuePair,
  type SeedResult,
} from "./helpers";

// ── Test: Solo cut — safe outcome ──────────────────────────────────────────
//
// Solo Cut requires selecting 2 wires from the LOCAL player's own rack that
// share the same value (GameBoard.soloCutMatchStatus / ActionPanel gate
// "Confirm Solo Cut" behind status === "valid"). /dev/seed deals wires
// randomly per call (wire-dealer.ts shuffles the full deck), so this test
// retries a handful of seeds until Dev's own rack happens to contain a
// duplicate-value pair rather than assuming one exists.

test("solo cut on two matching-value wires succeeds and cuts both wires", async ({
  page,
}) => {
  let seed: SeedResult | null = null;
  let dup: Awaited<ReturnType<typeof findLocalDuplicateValuePair>> = null;

  for (let attempt = 0; attempt < 5 && !dup; attempt++) {
    if (seed) await cleanupGame(seed.joinCode);
    seed = await seedGame(1);
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });
    dup = await findLocalDuplicateValuePair(page);
  }

  if (!seed) throw new Error("Failed to seed game");

  if (!dup) {
    await cleanupGame(seed.joinCode);
    test.skip(
      true,
      "Could not find a duplicate-value wire pair in Dev's own rack across 5 random /dev/seed deals — rare but possible given mission 1's 6-values-in-6-wires distribution",
    );
    return;
  }

  try {
    await page.getByRole("button", { name: "Solo Cut" }).click();
    await dup.wires[0].click();
    await dup.wires[1].click();

    const confirmBtn = page.getByRole("button", { name: "Confirm Solo Cut" });
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();

    await expect(page.getByText("Wire cut successfully!")).toBeVisible({
      timeout: 10_000,
    });

    // Cut wires render disabled (Wire.tsx: disabled={!onSelect || isCut})
    // and expose data-wire-status="cut".
    await expect(dup.wires[0]).toBeDisabled({ timeout: 5_000 });
    await expect(dup.wires[1]).toBeDisabled();
    await expect(dup.wires[0]).toHaveAttribute("data-wire-status", "cut");
    await expect(dup.wires[1]).toHaveAttribute("data-wire-status", "cut");
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
