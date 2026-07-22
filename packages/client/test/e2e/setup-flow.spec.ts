import { test, expect, request } from "@playwright/test";
import { API_URL, seedGame, cleanupGame, gameUrl, type SeedResult } from "./helpers";

async function seedSetupGame(mission = 1): Promise<SeedResult> {
  // Seeds a game (startGame) but does NOT call the dev-only completeSetup
  // shortcut, leaving the game in "setup" state so E2E tests can exercise
  // the turn-ordered opening-placement UI (#131) before the auto-transition
  // to active. Since #131, startGame itself already sets currentTurnPlayerId
  // to the captain — this response is already correctly positioned for
  // "Dev's turn to place first" with no extra setup needed.
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post("/dev/seed-setup", { data: { mission } });
  if (!res.ok()) throw new Error(`Seed-setup failed: ${res.status()}`);
  return res.json();
}

// ── Test 1: Active game board ──────────────────────────────────────────────

test("seed + navigate shows 4-player game board with wire racks", async ({
  page,
}) => {
  const seed = await seedGame(1);
  try {
    await page.goto(gameUrl(seed));

    // Four player racks visible (Dev + Alice + Bob + Carol)
    const racks = page.locator('[data-testid="player-rack"]');
    await expect(racks).toHaveCount(4, { timeout: 10_000 });

    // Each rack has at least one wire button, sorted lowest-to-highest by
    // rack position (the server assigns rackPosition 0, 1, 2… left-to-right)
    for (let i = 0; i < 4; i++) {
      const rack = racks.nth(i);
      const wires = rack.locator('button[data-wire-position]');
      const count = await wires.count();
      expect(count).toBeGreaterThan(0);

      const positions: number[] = [];
      for (let j = 0; j < count; j++) {
        const pos = await wires.nth(j).getAttribute("data-wire-position");
        positions.push(Number(pos));
      }
      // Positions should be non-decreasing
      for (let j = 1; j < positions.length; j++) {
        expect(positions[j]).toBeGreaterThanOrEqual(positions[j - 1]);
      }
    }
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// ── Tests 2-3: Board-first turn-ordered placement (#131) ───────────────────
//
// Corrected design (#decisions, 2026-07-22): no pre-game "setup phase"
// screen — opening info-token placement is the first step OF the game,
// played on the board, turn-ordered (captain first, then clockwise by seat
// order). engine.startGame already sets currentTurnPlayerId to the captain,
// so /dev/seed-setup's response lands exactly on "Dev's turn to place".

test("board renders for every player before the active placer has placed their token", async ({
  page,
}) => {
  const seed = await seedSetupGame(1);
  try {
    await page.goto(gameUrl(seed));
    await expect(page.getByRole("heading", { name: "Place Your Opening Info Token" })).toBeVisible({
      timeout: 10_000,
    });

    // Board-first: all 4 racks visible immediately, not just the active
    // placer's — this is the corrected design's point 2/3 (no bare screen).
    await expect(page.locator('[data-testid="player-rack"]')).toHaveCount(4, {
      timeout: 10_000,
    });
    await expect(page.getByText("Alice")).toBeVisible();
    await expect(page.getByText("Bob")).toBeVisible();
    await expect(page.getByText("Carol")).toBeVisible();
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

test("clicking a blue wire on your turn places info token and shows amber badge", async ({
  page,
}) => {
  const seed = await seedSetupGame(1);
  try {
    await page.goto(gameUrl(seed));

    await expect(page.getByText("Your turn — place your opening info token")).toBeVisible({
      timeout: 10_000,
    });

    // Find a blue wire in the local (Your Rack) section
    const yourRackSection = page.getByText("Your Rack").locator("..");
    const blueWires = yourRackSection.locator('[data-wire-color="blue"]');
    await expect(blueWires.first()).toBeVisible({ timeout: 5_000 });

    // Click the first blue wire to place the opening info token
    await blueWires.first().click();

    // Amber badge should appear on that wire
    const badge = yourRackSection.locator(".bg-amber-500").first();
    await expect(badge).toBeVisible({ timeout: 5_000 });

    // Badge value should be a digit (the token's value, not a count)
    const badgeText = await badge.textContent();
    expect(badgeText).toMatch(/^\d+$/);

    // Turn advances off the local player once they've placed
    await expect(page.getByText("Your turn — place your opening info token")).not.toBeVisible({
      timeout: 5_000,
    });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

// ── Test 4: Full turn-ordered placement across all 4 real identities ───────
//
// Unblocked by #107 (real profileId per seeded player) + #131 (turn-ordered
// placement, no separate captain "Start" trigger). Drives all 4 players'
// placements through real WS sessions — the exact scenario that was
// previously untestable with only one controllable identity, and the
// original premise mismatch (single-player action claiming to trigger a
// 4-player transition) that produced the earlier bug.

test("all 4 players place their opening token in turn order, auto-transitioning to active mission play", async ({
  page,
  browser,
}) => {
  const seed = await seedSetupGame(1);
  const byName = new Map(seed.players.map((p) => [p.name, p]));
  const alice = byName.get("Alice")!;
  const bob = byName.get("Bob")!;
  const carol = byName.get("Carol")!;

  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const carolContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const carolPage = await carolContext.newPage();

  async function placeOwnBlueWire(p: typeof page) {
    const yourRackSection = p.getByText("Your Rack").locator("..");
    await yourRackSection.locator('[data-wire-color="blue"]').first().click();
  }

  try {
    await page.goto(gameUrl(seed));
    await alicePage.goto(gameUrl({ ...seed, profileId: alice.profileId, playerName: alice.name }));
    await bobPage.goto(gameUrl({ ...seed, profileId: bob.profileId, playerName: bob.name }));
    await carolPage.goto(gameUrl({ ...seed, profileId: carol.profileId, playerName: carol.name }));

    // Seat order: Dev (captain, seat 0) → Alice (1) → Bob (2) → Carol (3).
    await expect(page.getByText("Your turn — place your opening info token")).toBeVisible({
      timeout: 10_000,
    });
    await placeOwnBlueWire(page);

    await expect(alicePage.getByText("Your turn — place your opening info token")).toBeVisible({
      timeout: 10_000,
    });
    await placeOwnBlueWire(alicePage);

    await expect(bobPage.getByText("Your turn — place your opening info token")).toBeVisible({
      timeout: 10_000,
    });
    await placeOwnBlueWire(bobPage);

    await expect(carolPage.getByText("Your turn — place your opening info token")).toBeVisible({
      timeout: 10_000,
    });
    await placeOwnBlueWire(carolPage);

    // Carol's placement was the last — the server auto-transitions the game
    // to active mission play with no separate trigger message. All 4 real
    // sessions should reflect it live via the same game_state broadcast.
    await expect(page.getByRole("heading", { name: "Place Your Opening Info Token" })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(alicePage.getByRole("heading", { name: "Place Your Opening Info Token" })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(bobPage.getByRole("heading", { name: "Place Your Opening Info Token" })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(carolPage.getByRole("heading", { name: "Place Your Opening Info Token" })).not.toBeVisible({
      timeout: 10_000,
    });

    // Exactly one of the 4 real sessions should see "Choose Action" — the
    // player whose real first mission turn it is.
    const activeTurnPages = [page, alicePage, bobPage, carolPage];
    let activeCount = 0;
    for (const p of activeTurnPages) {
      if (await p.getByText("Your turn — choose an action").isVisible().catch(() => false)) {
        activeCount++;
      }
    }
    expect(activeCount).toBe(1);
  } finally {
    await aliceContext.close();
    await bobContext.close();
    await carolContext.close();
    await cleanupGame(seed.joinCode);
  }
});

// ── Test 5: Turn advancement ───────────────────────────────────────────────

test("POST /dev/advance-turn rotates current player in UI", async ({ page }) => {
  const seed = await seedGame(1);
  try {
    await page.goto(gameUrl(seed));

    // Game is already active — note which player's turn it is
    await expect(page.getByText("Your turn — choose an action")).toBeVisible({
      timeout: 10_000,
    });

    // Advance turn via API
    const ctx = await request.newContext({ baseURL: API_URL });
    const advRes = await ctx.post("/dev/advance-turn", {
      data: { joinCode: seed.joinCode },
    });
    expect(advRes.ok()).toBeTruthy();
    // Response field is `playerName` (see packages/server/src/app.ts's
    // /dev/advance-turn handler) — not `currentPlayerName`. The prior
    // mismatch silently destructured undefined, producing a real timeout
    // ("Waiting for undefined...") that looked like a WS-broadcast bug but
    // was a test bug; confirmed by reproducing against a live local stack.
    const { playerName } = await advRes.json();

    // UI should reflect the new active player — local player is no longer active
    await expect(page.getByText(`Waiting for ${playerName}...`)).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
