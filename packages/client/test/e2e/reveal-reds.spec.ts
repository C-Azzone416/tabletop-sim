import { test, expect } from "@playwright/test";
import { MISSION_CONFIGS } from "@tabletop/shared";
import { seedGame, cleanupGame, gameUrl } from "./helpers";

// #187: hidden wires on OTHER players' racks arrive with color redacted
// (null), so pre-action "count the red wires everywhere" locators only ever
// see the viewer's own reds — and the deal is random, so that count isn't
// deterministic. The deterministic cross-player assertion is post-reveal:
// every red in the mission config is status=revealed with color visible.
const TOTAL_REDS = MISSION_CONFIGS[5].wireGroups
  .filter((g) => g.color === "red")
  .reduce((n, g) => n + g.values.length * g.copiesPerValue, 0);

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
    const revealedReds = page.locator(
      'button[data-wire-color="red"][data-wire-status="revealed"]',
    );
    // Pre-action: no red is revealed yet. (Others' hidden reds are
    // color-redacted per #187, so a pre-action red count isn't
    // deterministic — the deal decides how many reds are the viewer's own.)
    await expect(revealedReds).toHaveCount(0);

    await revealRedsBtn.click();

    // Every hidden red wire across EVERY player should now be "revealed" —
    // none left hidden, and revealed wires ship their color even on other
    // racks, so the full mission-config red count is the deterministic
    // cross-player assertion.
    await expect(hiddenReds).toHaveCount(0, { timeout: 10_000 });
    await expect(revealedReds).toHaveCount(TOTAL_REDS);

    // Turn advances after reveal_reds (executeRevealReds → advanceTurn), so
    // it's no longer the local player's turn.
    await expect(
      page.getByText("Your turn — choose an action"),
    ).not.toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
