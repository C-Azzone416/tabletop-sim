import { test, expect } from "@playwright/test";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findLocalDuplicateValuePair,
} from "./helpers";

// ── Test: WS reconnect / rejoin mid-game ───────────────────────────────────
//
// A full page reload re-runs GameClient's WS handshake with the same
// profileId/name query params (useWebSocket.connect). Server-side, the /ws
// upgrade handler (packages/server/src/app.ts) looks up
// playersDb.getActivePlayerByProfileId(user.profileId) and, if found,
// re-registers the new socket against the existing player and replays the
// current game_state via broadcastGameState — this is the actual "rejoin"
// path (as opposed to create_game/join_game, which would create a NEW
// player). Only Dev has a real profileId from /dev/seed, so this is the one
// identity we can drive through a reconnect.

test("reloading mid-game reconnects and rehydrates game state, including prior actions", async ({
  page,
}) => {
  const seed = await seedGame(1);
  try {
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    const racksBefore = page.locator('[data-testid="player-rack"]');
    await expect(racksBefore).toHaveCount(4, { timeout: 10_000 });

    // Take a real action before reloading, so the reconnect test proves the
    // server's persisted state is rehydrated — not just that the initial
    // seed data re-renders.
    const dup = await findLocalDuplicateValuePair(page);
    let cutValue: string | null = null;
    if (dup) {
      await page.getByRole("button", { name: "Solo Cut" }).click();
      await dup.wires[0].click();
      await dup.wires[1].click();
      const confirmBtn = page.getByRole("button", { name: "Confirm Solo Cut" });
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
      await confirmBtn.click();
      await expect(page.getByText("Wire cut successfully!")).toBeVisible({
        timeout: 10_000,
      });
      cutValue = dup.value;
    }

    // Simulate a dropped connection + rejoin via full page reload.
    await page.reload();

    // Board re-renders with all 4 players and the local player's rack again.
    const racksAfter = page.locator('[data-testid="player-rack"]');
    await expect(racksAfter).toHaveCount(4, { timeout: 10_000 });
    const localRackAfter = racksAfter.first();
    const wireButtonsAfter = localRackAfter.locator("button[data-wire-position]");
    expect(await wireButtonsAfter.count()).toBeGreaterThan(0);

    if (cutValue) {
      // At least one wire that was cut before reload should still be
      // reported as cut after reconnecting — proving real DB state was
      // rehydrated, not a fresh/blank board.
      const cutWires = localRackAfter.locator(
        'button[data-wire-status="cut"]',
      );
      expect(await cutWires.count()).toBeGreaterThan(0);
    }
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
