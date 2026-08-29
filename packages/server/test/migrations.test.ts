import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const mockSql = vi.fn();
vi.mock("../src/db/client.js", () => ({
  sql: (...args: unknown[]) => mockSql(...args),
}));

import { getMigrationsStatus, EXPECTED_MIGRATIONS } from "../src/db/migrations.js";

describe("getMigrationsStatus", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("reports current: true when every expected migration is applied", async () => {
    mockSql.mockResolvedValue(EXPECTED_MIGRATIONS.map(name => ({ name })));

    const status = await getMigrationsStatus();

    expect(status.current).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.applied).toEqual(EXPECTED_MIGRATIONS);
  });

  it("reports the missing migrations when some haven't been applied (the #140 staging incident shape)", async () => {
    mockSql.mockResolvedValue([
      { name: "001_initial_schema.sql" },
      { name: "007_wire_interrogation.sql" },
    ]);

    const status = await getMigrationsStatus();

    expect(status.current).toBe(false);
    expect(status.missing).toEqual([
      "002_mission1_updates.sql",
      "003_player_profiles.sql",
      "004_multi_color_mission.sql",
      "005_player_ready.sql",
      "006_setup_done.sql",
      "008_duo_cut_pending.sql",
      "009_dual_cut.sql",
      "010_info_token_dev_created.sql",
      "011_mission_outcomes.sql",
      "012_game_created_via.sql",
      "013_wire_candidates.sql",
      "014_game_type.sql",
      "015_spades_games.sql",
    ]);
  });

  it("treats a missing _migrations table as every migration missing, rather than throwing", async () => {
    mockSql.mockRejectedValue(new Error('relation "_migrations" does not exist'));

    const status = await getMigrationsStatus();

    expect(status.current).toBe(false);
    expect(status.applied).toEqual([]);
    expect(status.missing).toEqual(EXPECTED_MIGRATIONS);
  });
});

describe("EXPECTED_MIGRATIONS drift guard", () => {
  it("matches the migrations array in db/migrate.ts exactly", () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrateSource = readFileSync(join(__dirname, "../../../db/migrate.ts"), "utf-8");
    const match = migrateSource.match(/const migrations\s*=\s*\[([\s\S]*?)\]/);
    if (!match) throw new Error("Could not find migrations array in db/migrate.ts");
    const registered = [...match[1].matchAll(/'([^']+\.sql)'/g)].map(m => m[1]);

    expect(EXPECTED_MIGRATIONS).toEqual(registered);
  });
});
