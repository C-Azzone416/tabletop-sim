/**
 * #417 Check A — shared logic for "does this build chain build every
 * @tabletop/* workspace dependency before the thing that needs it,
 * in order?" Used by check-build-order.ts; split out so that file can stay
 * a thin CLI wrapper, matching db/check-migrations.ts's shape.
 *
 * This is intentionally light regex-based parsing (no YAML/glob library),
 * matching db/check-migrations.ts's own precedent of reading the two
 * sources of truth as text and comparing them, rather than pulling in
 * tooling this repo doesn't otherwise need.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface WorkspacePackage {
  /** package.json "name", e.g. "@tabletop/game-flip". */
  name: string;
  /** Path relative to repo root, e.g. "packages/games/flip". */
  path: string;
}

/**
 * Expands this repo's two workspace globs ("packages/*", "packages/games/*")
 * by reading the filesystem directly — both are simple one-level globs, so
 * there is no need for a real glob implementation.
 */
export function discoverWorkspacePackages(repoRoot: string, globs: string[]): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const glob of globs) {
    if (!glob.endsWith('/*')) {
      throw new Error(`discoverWorkspacePackages only supports "<dir>/*" globs, got: ${glob}`);
    }
    const dir = glob.slice(0, -2);
    const absDir = join(repoRoot, dir);
    for (const entry of readdirSync(absDir)) {
      const entryRelPath = `${dir}/${entry}`;
      const absEntryPath = join(repoRoot, entryRelPath);
      if (!statSync(absEntryPath).isDirectory()) continue;
      const pkgJsonPath = join(absEntryPath, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        if (typeof pkg.name === 'string') {
          packages.push({ name: pkg.name, path: entryRelPath });
        }
      } catch {
        // Not a package (no package.json, or unreadable) — skip. Nothing in
        // this repo's workspace globs is expected to hit this today.
      }
    }
  }
  return packages;
}

/**
 * Returns the `@tabletop/*` entries of a package's `dependencies`, resolved
 * to their workspace paths via `packages`. Throws if a declared dependency
 * has no matching workspace package — that is itself a real defect (a
 * dependency on a package that does not exist / was renamed), not something
 * this check should silently ignore.
 */
export function tabletopDependencyPaths(
  packageJsonPath: string,
  packages: WorkspacePackage[]
): string[] {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const deps: string[] = Object.keys(pkg.dependencies ?? {}).filter((d) =>
    d.startsWith('@tabletop/')
  );
  const byName = new Map(packages.map((p) => [p.name, p.path] as const));
  return deps.map((name) => {
    const path = byName.get(name);
    if (!path) {
      throw new Error(
        `${packageJsonPath} depends on "${name}", which has no matching workspace package (checked ${packages
          .map((p) => p.name)
          .join(', ')}). Is it renamed or removed from the workspace globs?`
      );
    }
    return path;
  });
}

/**
 * Extracts the ordered sequence of workspace paths a build chain's text
 * actually builds, resolving `npm run <scriptName>` indirection against
 * `rootScripts` (root package.json's own scripts, so e.g. `npm run
 * build:server` expands to whatever that script itself builds, recursively).
 *
 * Deliberately NOT a full shell parser — this repo's build chains are all
 * `&&`-joined `npm run ...` invocations (see render.yaml/vercel.json/root
 * package.json), and that is the only shape this needs to understand.
 */
export function extractBuildOrder(
  text: string,
  rootScripts: Record<string, string>,
  visited: Set<string> = new Set()
): string[] {
  const order: string[] = [];
  // One command per `&&`/`;`/newline-separated segment, in the order they'd
  // actually run.
  const commands = text.split(/&&|;|\n/).map((c) => c.trim());

  for (const command of commands) {
    const workspaceMatch = command.match(/^npm run build -w (\S+)$/);
    if (workspaceMatch) {
      order.push(workspaceMatch[1]);
      continue;
    }
    const scriptMatch = command.match(/^npm run ([\w:-]+)$/);
    if (scriptMatch) {
      const scriptName = scriptMatch[1];
      const scriptBody = rootScripts[scriptName];
      // Guards indirect self-reference (e.g. a script that calls itself
      // through another name) rather than assuming this repo's scripts are
      // acyclic forever.
      if (scriptBody && !visited.has(scriptName)) {
        order.push(...extractBuildOrder(scriptBody, rootScripts, new Set([...visited, scriptName])));
      }
      continue;
    }
    // Anything else (npm ci, npm install, a non-build script, a comment) is
    // not a build step this check cares about the order of.
  }
  return order;
}

/**
 * Same idea as extractBuildOrder, but for a document (ci.yml) where build
 * steps are separated by unrelated YAML/shell content rather than `&&`.
 * ci.yml is documented as one sequential job (#248's comment in the file
 * itself), so scanning the whole file top-to-bottom for `npm run build ...`
 * tokens in order of appearance correctly reconstructs execution order
 * without needing a YAML parser.
 */
export function extractBuildOrderFromDocument(
  text: string,
  rootScripts: Record<string, string>
): string[] {
  const order: string[] = [];
  const pattern = /npm run ([\w:-]+)(?: -w (\S+))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const [, scriptOrTarget, workspacePath] = match;
    if (workspacePath) {
      if (scriptOrTarget === 'build') order.push(workspacePath);
      continue;
    }
    const scriptBody = rootScripts[scriptOrTarget];
    if (scriptBody) {
      order.push(...extractBuildOrder(scriptBody, rootScripts, new Set([scriptOrTarget])));
    }
  }
  return order;
}

export interface ChainCheckResult {
  chainName: string;
  /** Dependency paths missing from the chain entirely, or built after the target. */
  problems: { depPath: string; reason: 'missing' | 'out-of-order' }[];
}

/**
 * Asserts every path in `requiredDepPaths` appears in `buildOrder` before
 * `targetPath`. `targetPath` itself must also appear (a chain that never
 * builds its own target is a different, equally real problem).
 */
export function checkChain(
  chainName: string,
  buildOrder: string[],
  requiredDepPaths: string[],
  targetPath: string
): ChainCheckResult {
  const targetIndex = buildOrder.indexOf(targetPath);
  const problems: ChainCheckResult['problems'] = [];

  if (targetIndex === -1) {
    // The chain never builds the target at all — every dependency is
    // trivially "out of order" relative to a build step that doesn't exist.
    for (const dep of requiredDepPaths) {
      problems.push({ depPath: dep, reason: 'missing' });
    }
    problems.push({ depPath: targetPath, reason: 'missing' });
    return { chainName, problems };
  }

  for (const dep of requiredDepPaths) {
    const depIndex = buildOrder.indexOf(dep);
    if (depIndex === -1) {
      problems.push({ depPath: dep, reason: 'missing' });
    } else if (depIndex > targetIndex) {
      problems.push({ depPath: dep, reason: 'out-of-order' });
    }
  }
  return { chainName, problems };
}
