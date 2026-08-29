import { test, expect } from "@playwright/test";
import { cleanupGame, signInAsNewPlayer, joinCodeFromUrl } from "./helpers";

// ── #320: E2E for the real host and join paths (#309 room entry flow) ──────
//
// Every other E2E spec in this suite enters via /dev/seed — a server-side
// backdoor that never touches page.tsx, /play, /play/host, or /play/join.
// #318's cutover deletes the inline create/join UI those specs never used
// in the first place, so none of them needed migrating. These specs are the
// ones that actually exercise the new entry surface: real credentials
// sign-in, the /play Host/Join choice, the registry-driven host screen
// (#316), and code-entry join (#317) — the walk with no prior coverage.

test.describe("host path: launch -> /play -> Host -> Wire Game -> lobby -> start -> playable", () => {
  test("a signed-in host creates a Wire Game room and reaches a playable board", async ({ page }) => {
    await signInAsNewPlayer(page, "Host");

    await page.getByRole("button", { name: "Play" }).click();
    await expect(page).toHaveURL(/\/play$/);

    await page.getByRole("link", { name: "Host New Game" }).click();
    await expect(page).toHaveURL(/\/play\/host$/);

    await page.getByText("Wire Game").click();

    // create_game round-trips over the WebSocket -> game_created -> push.
    await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/, { timeout: 10_000 });
    const joinCode = joinCodeFromUrl(page);

    try {
      await expect(page.getByText("Game Lobby")).toBeVisible();
      await expect(page.getByText(joinCode)).toBeVisible();

      // Solo captain: canStart only needs every seated player ready, and a
      // lone host is a valid seat count (game-engine.ts's startGame allows
      // as few as 1 player) — this is the minimal real walk to "playable"
      // without needing a second seat.
      await page.getByRole("button", { name: "Ready" }).click();
      await page.getByRole("button", { name: /Start Mission/ }).click();

      // Off the lobby entirely and onto the real board — a wire rack with
      // at least one wire is the same "playable" bar setup-flow.spec.ts
      // uses for the dev-seed path.
      const rack = page.locator('[data-testid="player-rack"]').first();
      await expect(rack.locator("button[data-wire-position]").first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanupGame(joinCode);
    }
  });
});

test.describe("join path: a second browser context joins by code into the same lobby", () => {
  test("two independently signed-in players land in the same lobby and see each other", async ({
    page,
    browser,
  }) => {
    const hostName = await signInAsNewPlayer(page, "Host");

    await page.getByRole("button", { name: "Play" }).click();
    await page.getByRole("link", { name: "Host New Game" }).click();
    await page.getByText("Wire Game").click();
    await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/, { timeout: 10_000 });
    const joinCode = joinCodeFromUrl(page);

    const joinerContext = await browser.newContext();
    const joinerPage = await joinerContext.newPage();

    try {
      await expect(page.getByText("Game Lobby")).toBeVisible();

      const joinerName = await signInAsNewPlayer(joinerPage, "Joiner");
      await joinerPage.getByRole("button", { name: "Play" }).click();
      await joinerPage.getByRole("link", { name: "Join Game" }).click();
      await expect(joinerPage).toHaveURL(/\/play\/join$/);

      await joinerPage.getByPlaceholder("Enter code").fill(joinCode);
      await joinerPage.getByRole("button", { name: "Join" }).click();

      // join_game round-trips -> joined_game -> push, same as the host path.
      await expect(joinerPage).toHaveURL(new RegExp(`/game/${joinCode}$`), {
        timeout: 10_000,
      });
      await expect(joinerPage.getByText("Game Lobby")).toBeVisible();

      // Real-time fan-out both directions, no reload — same property
      // multiplayer-sync.spec.ts proves for in-game actions, here proven at
      // the room-entry boundary itself.
      await expect(joinerPage.getByText(hostName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(joinerName)).toBeVisible({ timeout: 10_000 });
    } finally {
      await joinerContext.close();
      await cleanupGame(joinCode);
    }
  });
});

test.describe("join path: error states", () => {
  test("joining a well-formed but nonexistent code shows an error instead of hanging", async ({
    page,
  }) => {
    await signInAsNewPlayer(page, "Solo");

    await page.getByRole("button", { name: "Play" }).click();
    await page.getByRole("link", { name: "Join Game" }).click();
    await expect(page).toHaveURL(/\/play\/join$/);

    // Well-formed per the server's join-code alphabet (generateJoinCode:
    // A-Z/2-9 excluding I/O/0/1) but astronomically unlikely to exist —
    // exercises the server round-trip, not the client-side format guard.
    await page.getByPlaceholder("Enter code").fill("ZZZZZZ");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.getByText("Game not found")).toBeVisible({ timeout: 10_000 });
    // Still on /play/join, usable — not hung on "Joining...".
    await expect(page).toHaveURL(/\/play\/join$/);
    await expect(page.getByRole("button", { name: "Join" })).toBeEnabled();
  });
});
