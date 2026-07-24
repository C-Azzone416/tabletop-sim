/**
 * Post-deploy smoke check for production (issue #174).
 *
 * From the 2026-07-24 prod auth incident: AUTH_SECRET existed in Vercel's
 * Preview scope but not Production, so every /api/auth/* on prod returned 500
 * from the v0.2.0 deploy onward — unnoticed because nothing exercised prod
 * auth (not a code regression; auth.ts was unchanged). The #125 staging check
 * only guards staging. This is its production counterpart, closing the last
 * gap in the schema-drift/NODE_ENV/env-scope incident family: every
 * environment-scoped config now gets exercised by CI after deploy.
 *
 * Three invariants, per the issue:
 *
 *   1. Render prod /health -> 200 (server up and healthy).
 *   2. Vercel prod /api/auth/session -> 200 (the check that would have caught
 *      the incident: NextAuth returns 200 with a null session when its config
 *      is sound, 500 when AUTH_SECRET is missing/misscoped).
 *   3. POST /dev/seed -> 404 on BOTH hosts (the #98 fail-closed gate is
 *      holding — dev tooling must NOT be reachable in production). The probe
 *      must be a POST because that's the method the route registers; a GET
 *      404s even where the gate is broken. If the gate IS broken and the
 *      probe seeds a game, the script attempts /dev/cleanup and still fails.
 *
 * Initial reachability retries with backoff per host (same rationale as #125:
 * a cold start is otherwise indistinguishable from an outage); once a host
 * has answered, its remaining checks are fail-fast. All failures exit
 * non-zero and name the observed values.
 *
 * Usage: npx tsx scripts/prod-smoke-check.ts <renderProdUrl> <vercelProdUrl>
 */

const [renderUrl, vercelUrl] = process.argv.slice(2);

if (!renderUrl || !vercelUrl) {
  console.log('Usage: npx tsx scripts/prod-smoke-check.ts <renderProdUrl> <vercelProdUrl>');
  console.log('Not configured — skipping (no prod URLs provided).');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same schedule as the staging check: covers Render's ~50s worst-case cold
// start with margin (~63s total) without dragging out a genuine outage.
const RETRY_DELAYS_MS = [2_000, 5_000, 8_000, 12_000, 16_000, 20_000];

let failed = false;
function fail(message: string): void {
  console.error(`FAIL: ${message}`);
  failed = true;
}

async function checkReachableOk(label: string, url: string): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`OK: ${label}: GET ${url} -> ${res.status}${attempt > 0 ? ` (after ${attempt} retr${attempt === 1 ? 'y' : 'ies'})` : ''}`);
        return true;
      }
      // A non-OK HTTP response means the host is reachable — this is a real
      // failure (e.g. the AUTH_SECRET 500), not a cold start. Fail fast.
      fail(`${label}: GET ${url} -> ${res.status} (expected 200).`);
      return false;
    } catch (err) {
      console.log(`  attempt ${attempt + 1}: ${url} unreachable (${err instanceof Error ? err.message : err}), retrying...`);
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  fail(
    `${label}: ${url} did not respond after ${RETRY_DELAYS_MS.length + 1} attempts ` +
    `(~${Math.round(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 1000)}s of retries) — host is not reachable.`
  );
  return false;
}

async function checkDevSeedGated(label: string, baseUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/dev/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch (err) {
    fail(`${label}: POST ${baseUrl}/dev/seed errored (${err instanceof Error ? err.message : err}) — could not verify the dev-tooling gate.`);
    return;
  }

  if (res.status === 404) {
    console.log(`OK: ${label}: POST ${baseUrl}/dev/seed -> 404 (dev tooling gated off in production).`);
    return;
  }

  fail(
    `${label}: POST ${baseUrl}/dev/seed -> ${res.status} (expected 404 in production).\n` +
    `  Dev tooling is exposed on a production host — check ENABLE_DEV_SEED and NODE_ENV ` +
    `(fail-closed gate: routes register only when ENABLE_DEV_SEED === 'true' and NODE_ENV !== 'production').`
  );

  // If the probe actually seeded a game, don't leave it in the prod DB.
  if (res.ok) {
    try {
      const seeded = await res.json() as { joinCode?: string };
      if (seeded.joinCode) {
        const cleanupRes = await fetch(`${baseUrl}/dev/cleanup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ joinCode: seeded.joinCode }),
        });
        console.error(
          cleanupRes.ok
            ? `  (cleaned up accidentally seeded game ${seeded.joinCode})`
            : `  (cleanup of accidentally seeded game ${seeded.joinCode} failed with ${cleanupRes.status} — remove it manually)`
        );
      }
    } catch {
      console.error('  (could not parse seed response for cleanup — check prod DB for a stray seeded game)');
    }
  }
}

async function run(): Promise<void> {
  const renderUp = await checkReachableOk('render', `${renderUrl}/health`);
  const vercelUp = await checkReachableOk('vercel', `${vercelUrl}/api/auth/session`);

  // Gate checks only make sense against a host that answered at all.
  if (renderUp) await checkDevSeedGated('render', renderUrl);
  if (vercelUp) await checkDevSeedGated('vercel', vercelUrl);

  if (failed) {
    console.error('\nProd smoke check FAILED — see failures above.');
    process.exit(1);
  }
  console.log('\nProd smoke check passed: server healthy, auth config sound, dev tooling gated off on both hosts.');
}

run().catch((err) => {
  console.error('FAIL: prod smoke check errored unexpectedly:', err instanceof Error ? err.message : err);
  process.exit(1);
});
