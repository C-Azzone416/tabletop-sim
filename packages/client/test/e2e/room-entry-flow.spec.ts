import { test, expect, type Page } from "@playwright/test";
import { cleanupGame, signInAsNewPlayer, joinCodeFromUrl } from "./helpers";

/**
 * #445 — the host's "Players (X/Y)" is driven by one relayed WS broadcast
 * per join with no resync if that message is dropped, which is a real but
 * separate fragility from what #437's own test proves. A single
 * `toBeVisible` retries the SAME live page, so it can't recover from a
 * broadcast that's simply never going to arrive. Reloading re-fetches the
 * room's authoritative state fresh: if the underlying persisted value were
 * actually wrong (the #437 regression this assertion exists to catch), the
 * reload would show that wrong value too and this still fails correctly —
 * it only papers over a dropped message, not an incorrect one.
 */
async function expectPlayerCountEventually(page: Page, text: string) {
  try {
    await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload();
    await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  }
}

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

    // #437: picking a game moves to a count step on the same screen before
    // create_game is sent — pick a count, then confirm.
    await page.getByRole("button", { name: "4" }).click();
    await page.getByRole("button", { name: "Create Room" }).click();

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
    await page.getByRole("button", { name: "4" }).click();
    await page.getByRole("button", { name: "Create Room" }).click();
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

test.describe("host-chosen player count is enforced on join (#437)", () => {
  test("a host who picks 3 gets a room that refuses a 4th real joiner, even though Wire Game's registry max is 4", async ({
    page,
    browser,
  }) => {
    await signInAsNewPlayer(page, "Host");

    await page.getByRole("button", { name: "Play" }).click();
    await page.getByRole("link", { name: "Host New Game" }).click();
    await page.getByText("Wire Game").click();
    await page.getByRole("button", { name: "3" }).click();
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/, { timeout: 10_000 });
    const joinCode = joinCodeFromUrl(page);

    // #443 (leave_game, in flight): closing a browser context is a real
    // leave — the WS close deletes that player's row and renumbers seats.
    // So every joiner's context stays open for the whole test, same as the
    // two-player join test above; closing one early would make the room
    // drop below its cap and invert this test's own assertion.
    const secondContext = await browser.newContext();
    const thirdContext = await browser.newContext();
    const fourthContext = await browser.newContext();

    try {
      await expect(page.getByText("Players (1/3)")).toBeVisible();

      // Fills the room to the host's chosen 3 (registry max for Wire Game is 4).
      const secondPage = await secondContext.newPage();
      await signInAsNewPlayer(secondPage, "Second");
      await secondPage.getByRole("button", { name: "Play" }).click();
      await secondPage.getByRole("link", { name: "Join Game" }).click();
      await secondPage.getByPlaceholder("Enter code").fill(joinCode);
      await secondPage.getByRole("button", { name: "Join" }).click();
      await expect(secondPage).toHaveURL(new RegExp(`/game/${joinCode}$`), {
        timeout: 10_000,
      });
      // Asserted from the joiner's own view, not the host's live broadcast:
      // the host's "Players (X/Y)" is one relayed WS message per join with
      // no resync if a message is missed, which is a real but separate
      // fragility from what this test is proving. A joiner's own count
      // comes from that same join_game response, so it's authoritative
      // regardless of broadcast delivery to anyone else.
      await expect(secondPage.getByText("Players (2/3)")).toBeVisible({ timeout: 15_000 });

      // This is the case #437 exists to close: a registry ceiling of 4 must
      // not open a 4th seat once the room's persisted choice (3) is full.
      const thirdPage = await thirdContext.newPage();
      await signInAsNewPlayer(thirdPage, "Third");
      await thirdPage.getByRole("button", { name: "Play" }).click();
      await thirdPage.getByRole("link", { name: "Join Game" }).click();
      await thirdPage.getByPlaceholder("Enter code").fill(joinCode);
      await thirdPage.getByRole("button", { name: "Join" }).click();
      await expect(thirdPage).toHaveURL(new RegExp(`/game/${joinCode}$`), {
        timeout: 10_000,
      });
      // #437's AC is specifically that the HOST's lobby shows the persisted
      // count, not the registry ceiling — so this one stays on the host's
      // own view rather than the joiner's, even though it's the more
      // fragile of the two per #445's note above expectPlayerCountEventually.
      await expectPlayerCountEventually(page, "Players (3/3)");

      const fourthPage = await fourthContext.newPage();
      await signInAsNewPlayer(fourthPage, "Fourth");
      await fourthPage.getByRole("button", { name: "Play" }).click();
      await fourthPage.getByRole("link", { name: "Join Game" }).click();
      await fourthPage.getByPlaceholder("Enter code").fill(joinCode);
      await fourthPage.getByRole("button", { name: "Join" }).click();

      await expect(fourthPage.getByText("Game is full")).toBeVisible({ timeout: 10_000 });
      await expect(fourthPage).toHaveURL(/\/play\/join$/);
    } finally {
      await secondContext.close();
      await thirdContext.close();
      await fourthContext.close();
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
