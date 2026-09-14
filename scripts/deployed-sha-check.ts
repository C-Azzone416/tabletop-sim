/**
 * #481 (Check C, split from #417) — the only check that verifies a develop
 * push actually REACHED a running server, as opposed to merely building.
 *
 * The #413/#414 incident's exact shape: CI green, build green, 27 PRs
 * merged — and none of it was live, because Render's build command never
 * learned to build packages/games/flip. Nothing about the repo was wrong;
 * the gap was between the repo and reality. Checks A/B (#417) verify the
 * build is correct. This one polls the deployed server's /version and
 * asserts the commit it reports matches the commit that was just pushed —
 * a stale or half-deployed server is the one failure class no static check
 * can see.
 *
 * Modelled on staging-smoke-check.ts/prod-smoke-check.ts's shape (argv
 * config, graceful skip when unconfigured, retry-with-backoff, fail naming
 * the observed value) rather than sharing code with them — same reasoning
 * those two give for not sharing: small enough to duplicate, and each
 * check's exact retry/fail semantics are worth reading standalone.
 *
 * Usage: npx tsx scripts/deployed-sha-check.ts <serverUrl> <expectedSha> [apiAccessKey]
 *
 * Honest limit on the timeout below — see TOTAL_TIMEOUT_MS's own comment:
 * this session has no access to this repo's actual Render deploy history
 * (no dashboard, no API), so the bound is a reasoned estimate, not a
 * measurement. Flagged in the PR per the PM's explicit "say so rather than
 * picking a number that mostly works" instruction.
 */

const [serverUrl, expectedSha, apiAccessKey] = process.argv.slice(2);

if (!serverUrl || !expectedSha) {
  console.log('Usage: npx tsx scripts/deployed-sha-check.ts <serverUrl> <expectedSha> [apiAccessKey]');
  console.log('Not configured — skipping (no server URL/expected SHA provided).');
  process.exit(0);
}

if (!apiAccessKey) {
  console.log(
    'WARN: no apiAccessKey provided — a 401 from #252\'s access gate will be indistinguishable from a ' +
    'genuine "wrong commit deployed" failure this check exists to catch. See #262.'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Render's free/starter cold-start (~50s, see staging-smoke-check.ts) covers
// waking an ALREADY-deployed server. This check waits for a NEW deploy to
// finish building and shipping, which is a materially larger quantity this
// session has no real data for: no access to this repo's Render dashboard
// or deploy-history API from here, and Render doesn't publish a typical
// build-duration figure for a 5-package TypeScript monorepo build. 10
// minutes / 20s polling is a generous, reasoned-but-NOT-measured estimate
// (500 free-tier build-minutes/month is a quota, not a duration signal).
// Overridable via env vars so this can be exercised locally in seconds
// rather than minutes — see the PR description for how it was verified.
//
// Tune this from real data once this workflow has run a few times for
// real: the GitHub Actions run duration for this step, at that point, IS
// the observed figure this constant should have been based on.
const TOTAL_TIMEOUT_MS = Number(process.env.DEPLOYED_SHA_CHECK_TIMEOUT_MS ?? 10 * 60_000);
const POLL_INTERVAL_MS = Number(process.env.DEPLOYED_SHA_CHECK_POLL_INTERVAL_MS ?? 20_000);

interface VersionResponse {
  commit: string | null;
}

async function run(): Promise<void> {
  const startTime = Date.now();
  const deadline = startTime + TOTAL_TIMEOUT_MS;
  let attempt = 0;
  let lastObservedCommit: string | null | undefined;

  while (Date.now() < deadline) {
    attempt++;
    let res: Response;
    try {
      res = await fetch(`${serverUrl}/version`, {
        headers: apiAccessKey ? { 'x-api-key': apiAccessKey } : {},
      });
    } catch (err) {
      console.log(`  attempt ${attempt}: ${serverUrl}/version unreachable (${err instanceof Error ? err.message : err}), retrying...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // A real credential problem, not a deploy-in-progress state — retrying
    // won't fix a wrong secret, so fail fast rather than burning the whole
    // timeout window.
    if (res.status === 401) {
      console.error(
        apiAccessKey
          ? `FAIL: ${serverUrl}/version -> 401 even with this check's API key.\n` +
            `  Check that this check's apiAccessKey secret matches the deployment's configured API_ACCESS_KEY.`
          : `FAIL: ${serverUrl}/version -> 401 (#252's access gate rejected the unauthenticated probe).\n` +
            `  This check has no apiAccessKey configured, so it cannot get past that gate. See #262.`
      );
      process.exit(1);
    }

    // 404/5xx here is expected mid-deploy: the OLD instance may not have
    // this route yet (true the very first time this check ever runs,
    // before this PR's own /version endpoint has shipped) or may be
    // draining during the swap to the new one. Keep polling rather than
    // failing — that is exactly the state this check is waiting out.
    if (res.ok) {
      const body = (await res.json()) as VersionResponse;
      lastObservedCommit = body.commit;
      if (body.commit === expectedSha) {
        console.log(
          `OK: ${serverUrl}/version reports ${body.commit}, matches the pushed commit ` +
          `(after ${attempt} attempt${attempt === 1 ? '' : 's'}, ~${Math.round((Date.now() - startTime) / 1000)}s).`
        );
        return;
      }
      console.log(`  attempt ${attempt}: ${serverUrl}/version reports ${body.commit ?? '(null)'}, expected ${expectedSha}, retrying...`);
    } else {
      console.log(`  attempt ${attempt}: ${serverUrl}/version -> ${res.status}, retrying...`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error(
    `FAIL: ${serverUrl}/version never reported the pushed commit ${expectedSha} within ` +
    `${Math.round(TOTAL_TIMEOUT_MS / 1000)}s (${attempt} attempts).\n` +
    `  Last observed commit: ${lastObservedCommit ?? '(never got a successful response)'}\n` +
    `  Either the deploy is still in progress and needs longer than this check's timeout, or it failed ` +
    `outright — check Render's dashboard for this service's latest deploy status and logs.`
  );
  process.exit(1);
}

run().catch((err) => {
  console.error('FAIL: deployed-sha check errored unexpectedly:', err instanceof Error ? err.message : err);
  process.exit(1);
});
