import { test, expect } from "@playwright/test";
import { MISSION_CONFIGS } from "@tabletop/shared";
import type { ColorWireGroup } from "@tabletop/shared";
import {
  seedGame,
  cleanupGame,
  gameUrl,
  findOpponentHiddenWireByColor,
  type SeedResult,
} from "./helpers";

// #187: hidden wires on OTHER players' racks arrive with color redacted
// (null), so pre-action "count the red wires everywhere" locators only ever
// see the viewer's own reds — and the deal is random, so that count isn't
// deterministic. The deterministic cross-player assertion is post-reveal:
// every red in the mission config is status=revealed with color visible.
// `.filter((g) => g.color === "red")` alone doesn't narrow WireGroup's
// union for TS — needs an explicit type predicate to see `.count`.
const TOTAL_REDS = MISSION_CONFIGS[5].wireGroups
  .filter((g): g is ColorWireGroup => g.color === "red")
  .reduce((n, g) => n + g.count, 0);

// ── Test: Reveal reds action ───────────────────────────────────────────────
//
// Reveal Reds only appears once red wires exist in the mission
// (GameBoard.tsx: hasRedWires={game.mission >= 5}; server-side confirmed in
// executeRevealReds via MISSION_CONFIGS[mission].wireGroups.some(color ===
// 'red')). Mission 5 is the first mission with red wires
// (MISSION_5_CONFIG — red count is a #190 Phase A TODO(#216) placeholder,
// see TOTAL_REDS above rather than a hardcoded number). The action reveals
// every hidden red wire across ALL
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

// ── Test: Red instant-loss — dual-cut ACCEPT branch ─────────────────────────
//
// #253 gap list: red instant-loss on a dual_cut must hold on BOTH the
// accept and deny branches of executeRespondDualCut (#190 Phase B — "any
// cut attempt that resolves to red is a loss", not just a rejected guess).
// The deny branch is already covered — see win-loss.spec.ts's "wrong dual
// cut guess on a red wire" test, which drives the target clicking "No".
// This covers the other half: the target clicking "Yes" on a red wire is
// EQUALLY a loss (checkRedSave is always false today — no equipment system
// exists yet), even though accepting looks like it should proceed to the
// completion step. It must never reach that step for a red wire.
//
// Same 2-real-session pattern as win-loss.spec.ts's red-wire test: the
// guessed value is irrelevant to the outcome (accept/deny is the target's
// unilateral, unvalidated choice — see executeRespondDualCut), so any
// placeholder guess works.

test("dual cut: target ACCEPTS a red wire — instant loss, no completion step reached", async ({
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

    await page.getByRole("button", { name: "Dual Cut" }).click();
    await redWire.wire.click();
    await expect(page.getByText(/Guess the value of/i)).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder("Enter value…").fill("9");
    await page.getByRole("button", { name: "Propose Cut" }).click();

    await expect(
      targetPage.getByText(/guesses your wire.*has value/i),
    ).toBeVisible({ timeout: 10_000 });
    await targetPage.getByRole("button", { name: "Yes" }).click();

    // Accepting a red wire is an instant loss too — Mission Failed shows on
    // BOTH sessions, and the proposer's page never reaches the "Correct
    // Guess!" completion prompt wire-cutting/dual-cut's success path shows.
    await expect(page.getByText("Mission Failed")).toBeVisible({ timeout: 10_000 });
    await expect(targetPage.getByText("Mission Failed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Correct Guess!")).not.toBeVisible();
  } finally {
    await targetContext.close();
    await cleanupGame(seed.joinCode);
  }
});
