import { test, expect } from "@playwright/test";
import { cleanupGame, signInAsNewPlayer, joinCodeFromUrl } from "./helpers";

/**
 * #329 (QA finding on #505) — the bug this real-browser path exists to
 * catch: raw-WS verification (both the server's own unit/integration tests
 * and an earlier manual two-socket script) missed it entirely, because it
 * only exists in the real client architecture.
 *
 * The joining player's browser opens TWO WebSocket connections in
 * sequence: `usePlayAction` (the /play/join FORM itself) opens one to send
 * `join_game` and get `joined_game` back — which correctly carried
 * `lobbyConfig` — then explicitly disconnects it before navigating (#454).
 * `GameClient.tsx` then mounts fresh at `/game/[joinCode]` and opens its
 * OWN, second connection. Because a player row already exists for that
 * profileId by then, the server's WS-upgrade handler (`app.ts`) treats
 * this as a RECONNECT and sends `game_state`, never `joined_game` again —
 * and `game_state` never carried `lobbyConfig` until #505's fix. So the
 * connection that actually renders anything received nothing.
 *
 * Real credentials sign-in (not /dev/seed, which always calls
 * engine.startGame and can never leave a room in 'waiting') and the real
 * /play/host + /play/join UI, same pattern room-entry-flow.spec.ts
 * established — this is the ONLY path that reproduces the two-connection
 * architecture the bug lived in.
 */
test("a real joiner's lobby shows the captain's already-live config pick", async ({ page, browser }) => {
  await signInAsNewPlayer(page, "Host329");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/play$/);

  await page.getByRole("link", { name: "Host New Game" }).click();
  await expect(page).toHaveURL(/\/play\/host$/);
  await page.getByText("Wire Game").click();
  await page.getByRole("button", { name: "4" }).click();
  await page.getByRole("button", { name: "Create Room" }).click();

  await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/, { timeout: 10_000 });
  const joinCode = joinCodeFromUrl(page);

  try {
    await expect(page.getByText("Game Lobby")).toBeVisible();
    // The Start button (which would show "Start Mission 1") is gated on
    // isLocalPlayerReady, not a useful "config is live" signal by itself —
    // Ready first, so it renders and proves the captain's mount-time
    // default (mission 1, the only mission unlocked for a fresh profile)
    // actually committed, without starting the game (that needs a second
    // click, which never comes in this test).
    await page.getByRole("button", { name: "Ready" }).click();
    await expect(page.getByRole("button", { name: /Start Mission 1/ })).toBeVisible();

    const joinerContext = await browser.newContext();
    const joinerPage = await joinerContext.newPage();

    try {
      await signInAsNewPlayer(joinerPage, "Joiner329");
      await joinerPage.getByRole("button", { name: "Play" }).click();
      await joinerPage.getByRole("link", { name: "Join Game" }).click();
      await joinerPage.getByPlaceholder("Enter code").fill(joinCode);
      await joinerPage.getByRole("button", { name: "Join" }).click();

      // This URL land IS the moment GameClient mounts and opens the second
      // (server-perceived-as-reconnect) connection described above.
      await expect(joinerPage).toHaveURL(new RegExp(`/game/${joinCode}$`), { timeout: 10_000 });

      await expect(joinerPage.getByText("Select Mission")).toBeVisible({ timeout: 10_000 });
      const mission1 = joinerPage.getByRole("button", { name: /Mission 1/ });
      // Present AND disabled: canEdit=false is what makes this read-only
      // for a non-captain (#319's existing slot API) — confirms this isn't
      // an editable control the joiner could desync from the captain by
      // touching.
      await expect(mission1).toBeDisabled();
    } finally {
      await joinerContext.close();
    }
  } finally {
    await cleanupGame(joinCode);
  }
});
