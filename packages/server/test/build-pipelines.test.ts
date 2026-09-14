import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

// #414 — the guard that would have caught this.
//
// The develop server stopped deploying the moment Flip landed: packages/server
// gained a dependency on @tabletop/game-flip (created in #360), and Render's
// build command never learned to build it, so tsc found no declarations. That
// command lived in Render's DASHBOARD, outside this repository, so no PR check
// could see it — and it rotted invisibly through 27 PRs while the Vercel
// client deployed fine, because vercel.json IS version-controlled.
//
// Second build-order break in two days (#359 was the first, in CI). Both had
// the same shape: a new workspace package that one pipeline knew about and
// another did not.
//
// So these derive the required set from packages/server's OWN dependencies and
// assert every pipeline builds all of them, in dependency order, before the
// server. Adding a workspace package now fails here until every pipeline is
// updated, rather than silently at deploy time.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf-8");

/** Workspace packages packages/server depends on, as declared in its manifest. */
function serverWorkspaceDeps(): string[] {
  const pkg = JSON.parse(read("packages/server/package.json")) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith("@tabletop/"));
}

/** Maps a package name to its workspace path, e.g. @tabletop/game-flip -> packages/games/flip. */
function workspacePathOf(name: string): string {
  const candidates = [
    `packages/${name.replace("@tabletop/", "")}`,
    `packages/games/${name.replace("@tabletop/game-", "")}`,
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(read(`${candidate}/package.json`)) as { name: string };
      if (pkg.name === name) return candidate;
    } catch {
      // not this one
    }
  }
  throw new Error(`could not locate workspace path for ${name}`);
}

const rootScripts = (): Record<string, string> =>
  (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

/**
 * The text a pipeline effectively runs, following one level of indirection
 * through a root npm script. render.yaml delegates to `npm run build:server`
 * rather than repeating the chain, so checking its literal text alone would
 * pass vacuously — the ordering lives in the script it calls.
 */
function resolvedBuildText(pipelineText: string): string {
  const scripts = rootScripts();
  // The `(?! -w)` matters: `npm run build -w packages/shared` is a WORKSPACE
  // build, not a call to the root `build` script. Without it this expanded the
  // `npm run build` inside every CI step and destroyed the very strings the
  // assertions look for.
  return pipelineText.replace(/npm run ([A-Za-z:_-]+)(?! -w)/g, (whole, script: string) =>
    scripts[script] ? `${whole} => ${scripts[script]}` : whole,
  );
}

describe("every build pipeline builds the server's workspace dependencies (#414)", () => {
  const deps = serverWorkspaceDeps();

  it("the server actually declares workspace dependencies (guards the guard)", () => {
    // If this ever empties, the assertions below would pass vacuously.
    expect(deps.length).toBeGreaterThan(0);
    expect(deps).toContain("@tabletop/game-flip");
  });

  describe.each([
    ["render.yaml", "render.yaml"],
    ["CI workflow", ".github/workflows/ci.yml"],
    ["root build:server script", "package.json"],
  ])("%s", (_label, file) => {
    const contents = resolvedBuildText(read(file));

    it.each(deps)("builds %s before the server", (dep) => {
      const path = workspacePathOf(dep);
      const depBuild = contents.indexOf(`npm run build -w ${path}`);
      const serverBuild = contents.indexOf("npm run build -w packages/server");

      expect(depBuild, `${file} never builds ${path}`).toBeGreaterThanOrEqual(0);
      expect(serverBuild, `${file} never builds packages/server`).toBeGreaterThanOrEqual(0);
      expect(depBuild, `${file} builds ${path} after packages/server`).toBeLessThan(serverBuild);
    });
  });

  // Render's build command lives in its dashboard by default, which is exactly
  // how this rotted unseen. The Blueprint is what puts it under review.
  it("render.yaml exists and carries a build and start command", () => {
    const render = read("render.yaml");
    expect(render).toMatch(/buildCommand:/);
    expect(render).toMatch(/startCommand:/);
  });

  // The detail that turns a loud failure into a silent one if got wrong.
  //
  // src/index.ts is the entrypoint that calls runMigrationsOrExit() (#140) —
  // migrations run at BOOT and a failure is fatal. dist/app.js only exports
  // buildApp() and migrates nothing, so starting from it yields a server that
  // builds and boots cleanly with no flip_games table.
  describe("the start command must reach the migrating entrypoint", () => {
    const startLine = read("render.yaml")
      .split("\n")
      .find((line) => line.trim().startsWith("startCommand:"))!;

    it("render.yaml starts the server via its package start script", () => {
      expect(startLine).toContain("npm run start -w packages/server");
    });

    it("that script runs dist/index.js, not dist/app.js", () => {
      const serverPkg = JSON.parse(read("packages/server/package.json")) as {
        scripts: Record<string, string>;
      };
      expect(serverPkg.scripts.start).toContain("dist/index.js");
      expect(serverPkg.scripts.start).not.toContain("app.js");
    });

    it("index.ts — and only index.ts — runs the migrations at boot", () => {
      const index = read("packages/server/src/index.ts");
      expect(index).toContain("runMigrationsOrExit");
      // If app.ts ever grows its own migrate call, the "which entrypoint"
      // distinction above stops being load-bearing and this should be revisited.
      expect(read("packages/server/src/app.ts")).not.toContain("runMigrationsOrExit");
    });

    // index.ts resolves join(__dirname, '../../../db/migrate.ts'); from
    // packages/server/dist that is the repo-root db/. If the deployed tree
    // ever prunes db/, or the build runs from a subdirectory, the boot-time
    // migrate dies on spawn instead of surfacing as a missing table later.
    it("the migration runner it shells out to actually exists at that path", () => {
      expect(read("packages/server/src/index.ts")).toContain("../../../db/migrate.ts");
      expect(() => read("db/migrate.ts")).not.toThrow();
    });
  });

  // /dev/* is gated on ENABLE_DEV_SEED && NODE_ENV !== 'production'. The
  // Blueprint should not be the thing that arms it.
  it("render.yaml does not enable dev seeding", () => {
    expect(read("render.yaml")).not.toMatch(/ENABLE_DEV_SEED[\s\S]{0,40}value:\s*["']?true/);
  });
});
