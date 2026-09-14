/**
 * #417 Check A — static build-order guard, modelled directly on
 * db/check-migrations.ts: enumerate what is on disk, parse where it must be
 * registered, fail naming what is missing.
 *
 * This would have caught #414 at the moment `packages/games/flip` was
 * created in #372 — every workspace `@tabletop/*` dependency of
 * packages/server and packages/client must be built, in order, before its
 * dependent, in every one of that package's real build chains.
 *
 * Check B (scripts/check-build-order.ts's sibling, wired into ci.yml as
 * "Verify render.yaml build command") is the stronger check: it does not
 * compare strings, it actually RUNS render.yaml's build command from a
 * clean tree, so it cannot itself drift from what Render does. If this
 * check and Check B ever disagree, Check B is authoritative — this one
 * exists because it runs in about a second and names the missing package
 * immediately, which is what you want at PR-review time; Check B is the
 * proof, this is the fast first signal.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  discoverWorkspacePackages,
  tabletopDependencyPaths,
  extractBuildOrder,
  extractBuildOrderFromDocument,
  checkChain,
  type ChainCheckResult,
} from './build-order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
const rootScripts: Record<string, string> = rootPkg.scripts ?? {};

const packages = discoverWorkspacePackages(repoRoot, rootPkg.workspaces ?? []);

const serverDeps = tabletopDependencyPaths(join(repoRoot, 'packages/server/package.json'), packages);
const clientDeps = tabletopDependencyPaths(join(repoRoot, 'packages/client/package.json'), packages);

const ciYml = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf-8');

const renderYaml = readFileSync(join(repoRoot, 'render.yaml'), 'utf-8');
const renderBuildCommandMatch = renderYaml.match(/^\s*buildCommand:\s*(.+)$/m);
if (!renderBuildCommandMatch) {
  console.error('ERROR: Could not find a `buildCommand:` line in render.yaml.');
  process.exit(1);
}
const renderBuildCommand = renderBuildCommandMatch[1].trim();

const vercelJson = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf-8'));
const vercelBuildCommand: string = vercelJson.buildCommand ?? '';

const results: ChainCheckResult[] = [
  // Server chains — every @tabletop/* server dependency must build before
  // packages/server in each of these.
  checkChain(
    'root package.json "build:server" script',
    extractBuildOrder(rootScripts['build:server'] ?? '', rootScripts),
    serverDeps,
    'packages/server'
  ),
  checkChain(
    'root package.json "build" script',
    extractBuildOrder(rootScripts.build ?? '', rootScripts),
    serverDeps,
    'packages/server'
  ),
  checkChain(
    '.github/workflows/ci.yml',
    extractBuildOrderFromDocument(ciYml, rootScripts),
    serverDeps,
    'packages/server'
  ),
  checkChain('render.yaml buildCommand', extractBuildOrder(renderBuildCommand, rootScripts), serverDeps, 'packages/server'),

  // Client chains — every @tabletop/* client dependency must build before
  // packages/client in each of these.
  checkChain(
    'root package.json "build" script',
    extractBuildOrder(rootScripts.build ?? '', rootScripts),
    clientDeps,
    'packages/client'
  ),
  checkChain(
    '.github/workflows/ci.yml',
    extractBuildOrderFromDocument(ciYml, rootScripts),
    clientDeps,
    'packages/client'
  ),
  checkChain('vercel.json buildCommand', extractBuildOrder(vercelBuildCommand, rootScripts), clientDeps, 'packages/client'),
];

const failing = results.filter((r) => r.problems.length > 0);

if (failing.length > 0) {
  console.error('ERROR: The following build chains are missing a required workspace package build step:');
  for (const result of failing) {
    console.error(`\n  ${result.chainName}:`);
    for (const problem of result.problems) {
      const verb = problem.reason === 'missing' ? 'is not built at all' : 'is built AFTER its dependent';
      console.error(`    - ${problem.depPath} ${verb}`);
    }
  }
  console.error(
    '\nAdd a build step for the missing package(s) to each chain listed above, before the ' +
      'package that depends on it. See render.yaml and .github/workflows/ci.yml\'s own header ' +
      'comments for the pattern.'
  );
  process.exit(1);
}

console.log(
  `OK: every @tabletop/* dependency of packages/server and packages/client builds before its ` +
    `dependent in every checked build chain.`
);
