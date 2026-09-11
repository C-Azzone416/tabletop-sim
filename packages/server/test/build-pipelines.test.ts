import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

// #414 — the guard that would have caught this.
//
// The develop server stopped deploying the moment Flip landed: packages/server
// gained a dependency on @tabletop/game-flip (created in #360), and Render's
// build command never learned to build it, so tsc found no declarations. The
// command lived in Render's dashboard, outside this repository, so no PR check
// could see it — and the Vercel client deployed fine, because vercel.json IS
// version-controlled.
//
// That was the second build-order break in two days (#359 was the first, in
// CI). Both had the same shape: a new workspace package that one pipeline knew
// about and another did not.
//
// So these tests derive the required set from packages/server's OWN
// dependencies and assert every pipeline builds all of them, in dependency
// order, before the server. Adding a workspace package to the server now fails
// here until every pipeline is updated, rather than silently at deploy time.

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
  ])("%s", (_label, file) => {
    const contents = read(file);

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
    expect(render).toMatch(/npm run start -w packages\/server/);
  });

  // /dev/* is gated on ENABLE_DEV_SEED && NODE_ENV !== 'production'. The
  // Blueprint should not be the thing that arms it.
  it("render.yaml does not enable dev seeding", () => {
    const render = read("render.yaml");
    expect(render).not.toMatch(/ENABLE_DEV_SEED[\s\S]{0,40}value:\s*["']?true/);
  });
});
