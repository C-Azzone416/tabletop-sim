import { test, expect } from "@playwright/test";
import { seedGame, cleanupGame, gameUrl } from "./helpers";

// ── Test: Reveal reds action ───────────────────────────────────────────────
//
// Reveal Reds only appears once red wires exist in the mission
// (GameBoard.tsx: hasRedWires={game.mission >= 5}; server-side confirmed in
// executeRevealReds via MISSION_CONFIGS[mission].wireGroups.some(color ===
// 'red')). Mission 5 is the first mission with red wires
// (MISSION_5_CONFIG — 4 red wires of value 1, x4 copies = 16 total across a
// 4-player game). The action reveals every hidden red wire across ALL
// players (wiresDb.revealRedWires), transitioning them from "hidden" to
// "revealed" — it does not cut anything or change the detonator.

test("reveal reds action reveals all hidden red wires across every player", async ({
  page,
}) => {
  const seed = await seedGame(5);
  try {
    await page.goto(gameUrl(seed));
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    const revealRedsBtn = page.getByRole("button", { name: "Reveal Reds" });
    await expect(revealRedsBtn).toBeVisible({ timeout: 10_000 });

    const hiddenReds = page.locator(
      'button[data-wire-color="red"][data-wire-status="hidden"]',
    );
    const hiddenRedCount = await hiddenReds.count();
    expect(hiddenRedCount).toBeGreaterThan(0);

    await revealRedsBtn.click();

    // Every previously-hidden red wire should now be "revealed" — none left
    // hidden — and the total count of red wires is unchanged (nothing cut).
    await expect(hiddenReds).toHaveCount(0, { timeout: 10_000 });
    const revealedReds = page.locator(
      'button[data-wire-color="red"][data-wire-status="revealed"]',
    );
    await expect(revealedReds).toHaveCount(hiddenRedCount);

    // Turn advances after reveal_reds (executeRevealReds → advanceTurn), so
    // it's no longer the local player's turn.
    await expect(
      page.getByText("Your turn — choose an action"),
    ).not.toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
