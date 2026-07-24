import { test, expect } from "@playwright/test";
import { BASE_URL, API_URL, seedGame, cleanupGame } from "./helpers";

// ── Test: unauthenticated /game/:joinCode is gated (#182) ──────────────────
//
// #182: `packages/client/middleware.ts` used `auth` as middleware with no
// `callbacks.authorized` in auth.ts — in NextAuth/Auth.js v5 that only
// populates req.auth, it never actually blocks anything, so
// `curl /game/ABC123` with no cookies returned 200 and rendered the game
// page. The E2E suite never caught this because every existing spec drives
// seats via the dev-only `?profileId=...` query param (see helpers.ts's
// gameUrl()), which page.tsx's own `isDev` fallback has always accepted
// regardless of auth state — that path is untouched by this fix (auth.ts's
// authorized callback carves it out explicitly, narrowly: dev tools on AND
// a profileId param present, mirroring page.tsx's own fallback condition).
//
// This test is the negative-path case the #decisions policy (2026-07-24)
// requires alongside the fix: a request with NO profileId param — the shape
// a real unauthenticated visitor's browser would actually send — must be
// redirected, not served the game page. Per weasel's exposure assessment on
// the issue, the redirect is the UX half of the fix; the actual security
// property is the independent WS gate (authenticateUpgrade() requires a
// profileId+name pair matching a real DB profile), so this also asserts no
// WebSocket connection is ever opened pre-redirect.

test("unauthenticated /game/:joinCode redirects to sign-in and never opens a WebSocket", async ({
  page,
}) => {
  const seed = await seedGame(1);
  try {
    const wsUrls: string[] = [];
    page.on("websocket", (ws) => wsUrls.push(ws.url()));

    // Deliberately NOT using gameUrl() — that always appends the dev
    // profileId/playerName params this fix carves out. A bare join-code
    // hit is exactly what an unauthenticated visitor's browser sends.
    await page.goto(`${BASE_URL}/game/${seed.joinCode}`);

    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(
      page.getByRole("heading", { name: "Tabletop Simulator" }),
    ).toBeVisible({ timeout: 10_000 });

    // Give any late-firing connection attempt a beat to show up before
    // asserting its absence.
    await page.waitForTimeout(500);
    expect(wsUrls.filter((url) => url.startsWith(API_URL.replace(/^http/, "ws")))).toHaveLength(0);
  } finally {
    await cleanupGame(seed.joinCode);
  }
});
