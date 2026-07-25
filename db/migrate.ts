import { Client as NeonClient } from '@neondatabase/serverless';
import { Client as PgClient } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Falls back to the DATABASE_URL env var so this can run unattended as a
// deploy hook (#140 — `npm start`'s prestart lifecycle script calls this
// with no argv) as well as the existing manual CLI usage.
const DATABASE_URL = process.argv[2] ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Usage: npx tsx db/migrate.ts <DATABASE_URL>  (or set the DATABASE_URL env var)');
  process.exit(1);
}

// Neon's serverless driver expects Neon's WebSocket proxy, which a plain local
// Postgres doesn't provide — use the standard pg client for localhost targets
// (matches the same isLocal pattern as packages/server/src/db/client.ts).
const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const client = isLocal ? new PgClient(DATABASE_URL) : new NeonClient(DATABASE_URL);
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

const migrations = [
  '001_initial_schema.sql',
  '002_mission1_updates.sql',
  '003_player_profiles.sql',
  '004_multi_color_mission.sql',
  '005_player_ready.sql',
  '006_setup_done.sql',
  '007_wire_interrogation.sql',
  '008_duo_cut_pending.sql',
  '009_dual_cut.sql',
  '010_info_token_dev_created.sql',
  '011_mission_outcomes.sql',
  '012_game_created_via.sql',
];

// #166 — arbitrary fixed key for this runner's session-level advisory lock.
// Render runs a single instance today so this is currently a no-op, but
// protects against a race the moment that topology changes (horizontal
// scaling, zero-downtime deploys with boot overlap): two instances hitting
// `npm start`'s prestart hook concurrently could otherwise both see the
// same unapplied migration and both try to run it.
const MIGRATION_LOCK_KEY = 727271001;

async function run() {
  await client.connect();

  // Session-level lock tied to this connection: blocks until any other
  // instance's migration run finishes and releases it. The loser then
  // proceeds with an up-to-date _migrations table (read below, after the
  // lock is held) and no-ops through every migration the winner applied.
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    // Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Check which migrations have already been applied
    const { rows: applied } = await client.query('SELECT name FROM _migrations');
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    let count = 0;
    for (const file of migrations) {
      if (appliedSet.has(file)) {
        console.log(`  ⏭ ${file} (already applied)`);
        continue;
      }
      const content = readFileSync(join(migrationsDir, file), 'utf-8');
      console.log(`Running ${file}...`);
      await client.query(content);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`  ✓ ${file} applied`);
      count++;
    }

    if (count === 0) {
      console.log('\nAll migrations already applied.');
    } else {
      console.log(`\n${count} migration(s) applied.`);
    }
  } finally {
    // Always released, even on failure — a failed run must not deadlock
    // every future boot behind a lock nobody will ever release.
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
  await client.end();
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await client.end();
  process.exit(1);
});
