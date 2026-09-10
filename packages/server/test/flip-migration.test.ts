import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { GAME_REGISTRY } from "@tabletop/shared";

// #361 (epic #358). These are static checks over the SQL text, not a live
// database: CI has no Postgres, and the forward run is verified by hand
// against a scratch database (see the PR). What they buy is the thing a
// forward run would not catch anyway — the registry and the DB's backstop
// CHECK silently drifting apart when game number four is added.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migrationsDir = join(repoRoot, "db", "migrations");
const flipMigration = readFileSync(join(migrationsDir, "016_flip_games.sql"), "utf-8");

describe("016_flip_games migration", () => {
  it("is registered in db/migrate.ts", () => {
    const migrateSource = readFileSync(join(repoRoot, "db", "migrate.ts"), "utf-8");
    expect(migrateSource).toContain("016_flip_games.sql");
  });

  it("creates the state and per-round-score tables", () => {
    expect(flipMigration).toMatch(/CREATE TABLE IF NOT EXISTS flip_games\b/);
    expect(flipMigration).toMatch(/CREATE TABLE IF NOT EXISTS flip_round_scores\b/);
  });

  it("cascades both tables from games so a deleted room leaves nothing behind", () => {
    const cascades = flipMigration.match(/REFERENCES games\(id\) ON DELETE CASCADE/g);
    expect(cascades).toHaveLength(2);
  });

  // The registry is the primary create_game gate; this CHECK is the DB
  // backstop. If they disagree, a game either cannot be created despite
  // being available, or reaches the column without a registry entry.
  it("widens the game_type CHECK to exactly the registry's ids", () => {
    const check = flipMigration.match(/CHECK \(game_type IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();

    const allowed = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const registered = GAME_REGISTRY.map((game) => game.id);

    expect([...allowed].sort()).toEqual([...registered].sort());
  });

  it("drops the old constraint before re-adding it (Postgres cannot widen in place)", () => {
    const dropAt = flipMigration.indexOf("DROP CONSTRAINT IF EXISTS games_game_type_check");
    const addAt = flipMigration.indexOf("ADD CONSTRAINT games_game_type_check");
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(dropAt);
  });
});
