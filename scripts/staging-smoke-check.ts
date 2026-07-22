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
 * Usage: npx tsx scripts/staging-smoke-check.ts <serverUrl> <stagingOrigin>
 */

const [serverUrl, stagingOrigin] = process.argv.slice(2);

if (!serverUrl || !stagingOrigin) {
  console.log('Usage: npx tsx scripts/staging-smoke-check.ts <serverUrl> <stagingOrigin>');
  console.log('Not configured — skipping (no staging URL/origin provided).');
  process.exit(0);
}

async function run(): Promise<void> {
  const healthRes = await fetch(`${serverUrl}/health`);
  if (!healthRes.ok) {
    console.error(`FAIL: GET ${serverUrl}/health returned ${healthRes.status} — server is not reachable/healthy.`);
    process.exit(1);
  }
  console.log(`OK: ${serverUrl}/health -> ${healthRes.status}`);

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
