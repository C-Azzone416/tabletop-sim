import { test, expect, request } from "@playwright/test";
import { API_URL, seedGame, cleanupGame, gameUrl, type SeedResult } from "./helpers";

async function seedSetupGame(mission = 1): Promise<SeedResult> {
  // Seeds a game (startGame) but does NOT call completeSetup, leaving the
  // game in "setup" state so E2E tests can exercise the setup phase UI
  // before transition to active.
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

// ── Tests 2-4: Setup phase ────────────────────────────────────────────────

test("Start Game button is disabled before placing opening token", async ({
  page,
}) => {
  const seed = await seedSetupGame(1);
  try {
    await page.goto(gameUrl(seed));
    await expect(page.getByRole("button", { name: "Start Game" })).toBeDisabled({
      timeout: 10_000,
    });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

test("clicking a blue wire places info token and shows amber badge", async ({
  page,
}) => {
  const seed = await seedSetupGame(1);
  try {
    await page.goto(gameUrl(seed));

    // Wait for setup phase to render
    await expect(page.getByText("Setup Phase - Wire Interrogation")).toBeVisible({
      timeout: 10_000,
    });

    // Find a blue wire in the local (Your Rack) section
    const yourRackSection = page.getByText("Your Rack").locator("..").locator("..");
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
  } finally {
    await cleanupGame(seed.joinCode);
  }
});

test("Start Game button enables after placing opening token, captain starts game, transitions to active", async ({
  page,
}) => {
  const seed = await seedSetupGame(1);
  try {
    await page.goto(gameUrl(seed));

    await expect(page.getByText("Setup Phase - Wire Interrogation")).toBeVisible({
      timeout: 10_000,
    });

    // Button starts disabled
    const startBtn = page.getByRole("button", { name: "Start Game" });
    await expect(startBtn).toBeDisabled();

    // Place token on a blue local wire
    const yourRackSection = page.getByText("Your Rack").locator("..").locator("..");
    await yourRackSection.locator('[data-wire-color="blue"]').first().click();

    // Button enables
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });

    // Captain clicks Start Game
    await startBtn.click();

    // Game should transition to active state (action panel appears)
    await expect(page.getByText("Choose Action")).toBeVisible({ timeout: 10_000 });
  } finally {
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
    const { currentPlayerName } = await advRes.json();

    // UI should reflect the new active player — local player is no longer active
    await expect(page.getByText(`Waiting for ${currentPlayerName}...`)).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
