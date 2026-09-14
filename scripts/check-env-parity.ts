/**
 * #417 Check D — env var parity, modelled on db/check-migrations.ts: scan
 * what the code actually reads, parse what's documented, fail naming what's
 * missing.
 *
 * Catches a new `process.env.X` reference that works locally (it's in a
 * developer's own .env.local, never committed) and is unset on Vercel or
 * Render — a different failure class from #414's build-order gap: the build
 * and deploy both succeed, and the app runs, just wrong (or crashes at the
 * first access, for a server boot-time read).
 *
 * Does NOT verify the value is actually *set* on either platform — that
 * needs API access this check doesn't have. It only verifies the
 * requirement is visible and reviewable, i.e. that every env var the code
 * depends on has a line in .env.example (commented-out entries count: an
 * optional var documented as "# FOO=" is exactly as reviewable as a
 * required one).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// NODE_ENV is set by the platform/runtime itself (Render, Vercel, `npm test`,
// CI) — never something a developer configures via .env.local, so it has no
// business in a .env.example and would be a permanent, correct false
// positive if not exempted.
const AMBIENT_VARS = new Set(['NODE_ENV']);

function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, extensions));
    } else if (extensions.includes(extname(full))) {
      results.push(full);
    }
  }
  return results;
}

function scanEnvReferences(dir: string): Set<string> {
  const vars = new Set<string>();
  for (const file of findFiles(dir, ['.ts', '.tsx'])) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      vars.add(match[1]);
    }
  }
  return vars;
}

function documentedVars(envExamplePath: string): Set<string> {
  const content = readFileSync(envExamplePath, 'utf-8');
  const vars = new Set<string>();
  // Matches both `FOO=...` and commented-out `# FOO=...` (an optional var
  // documented but left unset is exactly as reviewable as a required one).
  for (const match of content.matchAll(/^#?\s*([A-Z_][A-Z0-9_]*)=/gm)) {
    vars.add(match[1]);
  }
  return vars;
}

interface Surface {
  label: string;
  srcDir: string;
  envExamplePath: string;
}

const surfaces: Surface[] = [
  {
    label: 'packages/server',
    srcDir: join(repoRoot, 'packages/server/src'),
    envExamplePath: join(repoRoot, 'packages/server/.env.example'),
  },
  {
    label: 'packages/client',
    srcDir: join(repoRoot, 'packages/client/app'),
    envExamplePath: join(repoRoot, 'packages/client/.env.example'),
  },
];

let failed = false;

for (const surface of surfaces) {
  const referenced = scanEnvReferences(surface.srcDir);
  const documented = documentedVars(surface.envExamplePath);
  const missing = [...referenced].filter((v) => !documented.has(v) && !AMBIENT_VARS.has(v)).sort();

  if (missing.length > 0) {
    failed = true;
    console.error(`ERROR: ${surface.label} reads env vars not documented in ${surface.envExamplePath}:`);
    for (const v of missing) {
      console.error(`  - ${v}`);
    }
    console.error(
      `\nAdd a line for each to ${surface.envExamplePath} (commented-out is fine for an optional var) ` +
        `so its requirement is visible and reviewable.\n`
    );
  }
}

if (failed) {
  process.exit(1);
}

console.log('OK: every process.env reference in packages/server and packages/client is documented in its .env.example.');
