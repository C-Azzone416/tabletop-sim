import { sql } from './client.js';

// Kept in sync with the `migrations` array in db/migrate.ts (repo root) —
// there's no shared module between the two (migrate.ts runs standalone via
// tsx outside the packages/server TS project), so this list is duplicated
// intentionally. A dedicated test (routes.test.ts) reads db/migrate.ts's
// source and asserts this array matches it, so drift fails CI instead of
// silently producing a false "current" reading on staging.
export const EXPECTED_MIGRATIONS = [
  '001_initial_schema.sql',
  '002_mission1_updates.sql',
  '003_player_profiles.sql',
  '004_multi_color_mission.sql',
  '005_player_ready.sql',
  '006_setup_done.sql',
  '007_wire_interrogation.sql',
  '008_duo_cut_pending.sql',
  '009_dual_cut.sql',
];

export async function getMigrationsStatus(): Promise<{
  expected: string[];
  applied: string[];
  missing: string[];
  current: boolean;
}> {
  let applied: string[] = [];
  try {
    const rows = await sql`SELECT name FROM _migrations`;
    applied = rows.map(r => r.name as string);
  } catch {
    // _migrations table doesn't exist yet — every migration is missing.
    applied = [];
  }
  const appliedSet = new Set(applied);
  const missing = EXPECTED_MIGRATIONS.filter(m => !appliedSet.has(m));
  return { expected: EXPECTED_MIGRATIONS, applied, missing, current: missing.length === 0 };
}
