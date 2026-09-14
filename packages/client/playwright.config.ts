import { defineConfig, devices } from "@playwright/test";
import path from "path";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiURL = process.env.E2E_API_URL ?? "http://localhost:3001";
const repoRoot = path.resolve(__dirname, "../..");

// #261 — both PORTs are DERIVED from the same URLs Playwright itself
// navigates to/health-checks, not hardcoded. Previously the client's PORT
// was hardcoded to "3000" regardless of E2E_BASE_URL, so pointing
// E2E_BASE_URL at an alternate port (the documented fix for a shared
// machine) silently didn't work — the client still bound 3000 underneath
// whatever URL the config *thought* it was checking.
const clientPort = new URL(baseURL).port || "3000";
const serverPort = new URL(apiURL).port || "3001";

// #486 — resolved ONCE here (rather than separately in the webServer env
// below and in rate-limit.spec.ts's own process.env lookup) and written
// back onto this config process's own env, so a spec file reading
// `process.env.PROFILES_RATE_LIMIT_MAX` sees the SAME value the server was
// actually launched with — Playwright spawns test workers as children of
// this process, which inherit env at spawn time, but the server's own
// child-only `env: {...}` override below never propagates back up to this
// process on its own.
const profilesRateLimitMax = process.env.PROFILES_RATE_LIMIT_MAX ?? "200";
process.env.PROFILES_RATE_LIMIT_MAX = profilesRateLimitMax;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Local-stack E2E (decision: #decisions, 2026-07-22 — no staging secrets,
  // no Vercel SSO). Both processes must already be built (`npm run build`)
  // before this config runs, since packages/client's NEXT_PUBLIC_* dev-tools
  // flag is inlined at build time, not runtime.
  //
  // #261 — `reuseExistingServer` used to be `!process.env.CI`, so a local
  // run would silently attach to whatever was already listening on these
  // ports. On a machine several agents share, that's routinely someone
  // else's server built from a different commit: the run looks like it
  // seeded and loaded a game (the request layer really did talk to
  // something), but the browser is driving a stale client bundle pointed at
  // a stale/different server, producing an empty "Game Lobby (0/4)" with no
  // on-page error — or worse, a run that happens to attach to a *healthy*
  // stale server can pass, reporting green for code it never executed.
  // Always `false` now: a local run either starts its own stack fresh, or
  // fails LOUDLY on port conflict (Node's EADDRINUSE, surfaced verbatim
  // through Playwright's webServer startup error) instead of silently
  // running against the wrong one. This does remove the old "reuse my
  // already-running `npm run dev`" convenience — concurrent agents (or a
  // dev session alongside a suite run) now need distinct ports via
  // E2E_BASE_URL/E2E_API_URL (see docs/local-dev.md), which also makes that
  // isolation actually work, since clientPort/serverPort above are derived
  // from those same URLs instead of a separate hardcoded port.
  webServer: [
    {
      command: "npm run start -w packages/server",
      cwd: repoRoot,
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // #486 — #264's POST /profiles rate limiter defaults to 20 requests
      // per 60s per IP, sized for real traffic. The FULL E2E directory runs
      // single-worker against one server process, so every real sign-in
      // across every spec file shares ONE bucket keyed on 127.0.0.1 — a
      // suite that does 20+ real sign-ins trips the same limiter a real
      // user would, non-deterministically, right at the boundary. Raised
      // for the E2E/test stack ONLY, via the existing env var (never a new
      // code path, see profilesRateLimitMax above) — staging and
      // production are untouched, since they never set this override.
      // Picked with headroom well past this file's current volume (this
      // file alone already does 20+ real sign-ins after #435/#485), not
      // just past today's exact count, so the next test this file grows
      // doesn't reopen the same flake. rate-limit.spec.ts is the dedicated
      // coverage that the limiter itself still actually fires — asserted
      // against this exact configured value, never a hardcoded number, so
      // raising it again later can't silently make that test assert
      // nothing.
      env: { ...process.env, PORT: serverPort, PROFILES_RATE_LIMIT_MAX: profilesRateLimitMax },
    },
    {
      command: "npm run start -w packages/client",
      cwd: repoRoot,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env, PORT: clientPort },
    },
  ],
});
