import { test, expect, request } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";

// #486 — mirrors app.ts's own default/env lookup exactly, so this test
// always asserts against the CEILING THE SERVER IS ACTUALLY RUNNING WITH
// (playwright.config.ts raises it for the E2E stack via this same env var),
// never a hardcoded number that could silently drift from it and start
// asserting nothing.
const RATE_LIMIT_MAX = Number(process.env.PROFILES_RATE_LIMIT_MAX ?? 20);

// #486 — POST /profiles' #264 rate limiter is real, and the rest of this
// suite's own real sign-ins used to trip it non-deterministically (see the
// issue): every real sign-in across every spec file in this single-worker
// run shares one bucket keyed on request.ip, and this file alone does
// 20+ of them. Raising the limit (playwright.config.ts) makes that
// accidental, timing-dependent failure go away — but with nothing left
// that exercises the limiter at all, the first person to actually break
// rate limiting would find out in production. This test is that coverage,
// made deterministic rather than incidental.
//
// Isolated from every other test's sign-in traffic via a dedicated
// X-Forwarded-For value: trustProxy:1 (app.ts) honors exactly one XFF hop,
// which — with no real reverse proxy in front locally — means the raw
// client's own header is what request.ip resolves to. That's a documented
// local/test-only property (see app.ts's own trustProxy comment); behind
// Render's real edge in staging/production, the actual client-supplied
// header would be overwritten before the app ever saw it. Confirmed
// manually before relying on it here: two distinct X-Forwarded-For values
// hit completely independent buckets, one tripping 429 at request 21 (a
// 20-max limiter) while the other stayed unaffected at 201.
test.describe("POST /profiles rate limiting (#264, #486)", () => {
  test(`allows exactly ${RATE_LIMIT_MAX} requests per window, then refuses the next with 429`, async () => {
    const probeIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { "x-forwarded-for": probeIp },
    });

    let successCount = 0;
    let rateLimitedResponse: { status: number; body: unknown } | null = null;

    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      // Profile names are capped at 20 chars (#264/#252) — kept short so a
      // three-digit `i` (this loop runs past 100 for a raised E2E limit)
      // never accidentally trips THAT validation instead of the rate
      // limiter this test is actually probing.
      const res = await ctx.post("/profiles", {
        data: { name: `RL${i}${Math.random().toString(36).slice(2, 6)}` },
      });
      if (res.status() === 429) {
        rateLimitedResponse = { status: res.status(), body: await res.json() };
        break;
      }
      expect(res.ok(), `request ${i} should succeed while under the limit`).toBe(true);
      successCount++;
    }

    // The limiter fires exactly at the configured boundary, not before it
    // and not after — every request up to the max succeeded.
    expect(successCount).toBe(RATE_LIMIT_MAX);
    expect(rateLimitedResponse).not.toBeNull();
    expect(rateLimitedResponse).toEqual({ status: 429, body: { error: "Too many requests" } });
  });

  test("a distinct IP is unaffected by another IP's exhausted limit", async () => {
    const exhaustedIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const freshIp = `10.98.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    const exhaustedCtx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { "x-forwarded-for": exhaustedIp },
    });
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      await exhaustedCtx.post("/profiles", {
        data: { name: `ExhaustProbe${i}${Math.random().toString(36).slice(2, 7)}` },
      });
    }

    const freshCtx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { "x-forwarded-for": freshIp },
    });
    const res = await freshCtx.post("/profiles", {
      data: { name: `FreshProbe${Math.random().toString(36).slice(2, 7)}` },
    });
    expect(res.ok()).toBe(true);
  });
});
