import { defineConfig, devices } from "@playwright/test";
import path from "path";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiURL = process.env.E2E_API_URL ?? "http://localhost:3001";
const repoRoot = path.resolve(__dirname, "../..");

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
  // flag is inlined at build time, not runtime. `reuseExistingServer` lets a
  // local dev with `npm run dev` already running skip a redundant second
  // instance; CI always starts fresh.
  webServer: [
    {
      command: "npm run start -w packages/server",
      cwd: repoRoot,
      url: `${apiURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Explicit PORT override: both `node dist/index.js` (server) and
      // `next start` (client) read process.env.PORT, so without this the
      // client silently tries to bind whatever port the server env sets.
      command: "npm run start -w packages/client",
      cwd: repoRoot,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: "3000" },
    },
  ],
});
