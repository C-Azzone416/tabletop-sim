/**
 * Post-deploy smoke check for the dev-tooling gate on staging (issue #122).
 *
 * PR #98's fail-closed gate (ENABLE_DEV_SEED === 'true' && NODE_ENV !== 'production')
 * silently disabled all /dev/* routes on staging for ~26 hours because Render
 * defaults Node services to NODE_ENV=production — nothing caught it until a
 * human noticed. This check hits the real staging deployment and fails loudly
 * (non-zero exit, named observed values) if either of the two invariants a
 * working manual staging-testing session depends on has drifted:
 *
 *   1. Dev routes are actually registered (today's NODE_ENV incident).
 *   2. CORS still allows the stable staging origin (the #121 class of drift —
 *      the allowlist silently falling out of sync with the real deployed URL).
 *
 * Same probe covers both: POST /dev/seed with the stable origin as the Origin
 * header, then check the response status (not 404) and the
 * access-control-allow-origin response header (present, matching). Cleans up
 * the seeded game via /dev/cleanup so the smoke check doesn't leak games into
 * staging.
 *
 * Reachability (the initial /health call) retries with backoff before
 * failing — Render's dev-tier services commonly cold-start/spin down on
 * inactivity, and this runs on a schedule against a service that may
 * legitimately be asleep. Without a retry, a cold start is indistinguishable
 * from a real outage, which undermines trust in the check as a deploy gate
 * (zippy-weasel, PR #125 review). Once the server has answered /health once,
 * it's warm — the /dev/seed route/CORS checks after that stay fail-fast.
 *
 * Usage: npx tsx scripts/staging-smoke-check.ts <serverUrl> <stagingOrigin>
 */

const [serverUrl, stagingOrigin] = process.argv.slice(2);

if (!serverUrl || !stagingOrigin) {
  console.log('Usage: npx tsx scripts/staging-smoke-check.ts <serverUrl> <stagingOrigin>');
  console.log('Not configured — skipping (no staging URL/origin provided).');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Render's free/starter-tier cold start can take up to ~50s. 6 attempts with
// this backoff schedule covers that with margin (total wait ~63s) without
// dragging out a genuine-outage failure indefinitely.
const HEALTH_RETRY_DELAYS_MS = [2_000, 5_000, 8_000, 12_000, 16_000, 20_000];

async function waitForHealthy(): Promise<void> {
  for (let attempt = 0; attempt <= HEALTH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const healthRes = await fetch(`${serverUrl}/health`);
      if (healthRes.ok) {
        console.log(`OK: ${serverUrl}/health -> ${healthRes.status}${attempt > 0 ? ` (after ${attempt} retr${attempt === 1 ? 'y' : 'ies'})` : ''}`);
        return;
      }
      console.log(`  attempt ${attempt + 1}: ${serverUrl}/health -> ${healthRes.status}, retrying...`);
    } catch (err) {
      console.log(`  attempt ${attempt + 1}: ${serverUrl}/health unreachable (${err instanceof Error ? err.message : err}), retrying...`);
    }
    if (attempt < HEALTH_RETRY_DELAYS_MS.length) {
      await sleep(HEALTH_RETRY_DELAYS_MS[attempt]);
    }
  }
  console.error(
    `FAIL: ${serverUrl}/health did not respond OK after ${HEALTH_RETRY_DELAYS_MS.length + 1} attempts ` +
    `(~${Math.round(HEALTH_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 1000)}s of retries) — server is not reachable/healthy.`
  );
  process.exit(1);
}

async function run(): Promise<void> {
  await waitForHealthy();

  const seedRes = await fetch(`${serverUrl}/dev/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: stagingOrigin },
    body: JSON.stringify({}),
  });

  if (seedRes.status === 404) {
    console.error(
      `FAIL: POST ${serverUrl}/dev/seed returned 404 — dev routes are not registered.\n` +
      `  Check ENABLE_DEV_SEED and NODE_ENV on this deployment (fail-closed gate: ` +
      `both ENABLE_DEV_SEED === 'true' and NODE_ENV !== 'production' are required).`
    );
    process.exit(1);
  }

  const allowOrigin = seedRes.headers.get('access-control-allow-origin');
  if (allowOrigin !== stagingOrigin) {
    console.error(
      `FAIL: POST ${serverUrl}/dev/seed did not return a matching CORS header for Origin: ${stagingOrigin}.\n` +
      `  Observed access-control-allow-origin: ${allowOrigin ?? '(none)'}\n` +
      `  Check CORS_ORIGINS on this deployment matches the real staging URL.`
    );
    process.exit(1);
  }

  if (!seedRes.ok) {
    console.error(`FAIL: POST ${serverUrl}/dev/seed returned ${seedRes.status} — dev routes registered and CORS ok, but seeding itself failed.`);
    process.exit(1);
  }

  const seeded = await seedRes.json() as { joinCode: string };
  console.log(`OK: POST ${serverUrl}/dev/seed -> ${seedRes.status}, access-control-allow-origin matches, seeded ${seeded.joinCode}`);

  const cleanupRes = await fetch(`${serverUrl}/dev/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ joinCode: seeded.joinCode }),
  });
  if (!cleanupRes.ok) {
    console.warn(`WARN: cleanup of seeded game ${seeded.joinCode} failed (${cleanupRes.status}) — not a smoke-check failure, but staging may accumulate a stray game.`);
  } else {
    console.log(`OK: cleaned up seeded game ${seeded.joinCode}`);
  }

  console.log('\nSmoke check passed: dev routes registered, CORS allows the stable staging origin.');
}

run().catch((err) => {
  console.error('FAIL: smoke check errored unexpectedly:', err instanceof Error ? err.message : err);
  process.exit(1);
});
