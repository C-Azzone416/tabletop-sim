import { Client as NeonClient } from '@neondatabase/serverless';
import { Client as PgClient } from 'pg';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runMigrations, redactDatabaseUrl, type MigrationClient } from './migration-runner.js';

// Falls back to the DATABASE_URL env var so this can run unattended as a
// deploy hook (#140 — invoked from packages/server/src/index.ts's boot
// sequence, not an npm lifecycle script) as well as the existing manual CLI
// usage.
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

// pg's Client.query is heavily overloaded (streaming, array-mode, config
// object, ...) — TS can't structurally match that overload set against
// MigrationClient's single simple signature when `client` is a
// PgClient|NeonClient union, so runMigrations gets a plain single-signature
// adapter instead of the client itself.
const migrationClient: MigrationClient = {
  query: (text, params) => client.query(text, params as unknown[]),
};
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
  '013_wire_candidates.sql',
  '014_game_type.sql',
  '015_spades_games.sql',
];

// #166 — arbitrary fixed key for this runner's session-level advisory lock.
// Render runs a single instance today so this is currently a no-op, but
// protects against a race the moment that topology changes (horizontal
// scaling, zero-downtime deploys with boot overlap): two instances hitting
// index.ts's boot-time migration call concurrently could otherwise both see
// the same unapplied migration and both try to run it.
const MIGRATION_LOCK_KEY = 727271001;

async function run() {
  const startedAt = Date.now();
  await client.connect();

  // #212 — pre-flight context: target host (never the full connection
  // string — it carries credentials, and this script also receives it as
  // argv[2], i.e. process args) before doing anything, so the logs prove
  // the migration step actually ran against the host you expect.
  console.log(`Connecting to ${redactDatabaseUrl(DATABASE_URL!)}...`);

  // Session-level lock tied to this connection: blocks until any other
  // instance's migration run finishes and releases it. The loser then
  // proceeds with an up-to-date _migrations table (read below, after the
  // lock is held) and no-ops through every migration the winner applied.
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  let result: { appliedCount: number; pendingCount: number };
  try {
    result = await runMigrations(migrationClient, migrationsDir, migrations);
  } finally {
    // Always released, even on failure — a failed run must not deadlock
    // every future boot behind a lock nobody will ever release.
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
  await client.end();

  const elapsedMs = Date.now() - startedAt;
  if (result.appliedCount === 0) {
    console.log(`\nAll migrations already applied. (${elapsedMs}ms)`);
  } else {
    console.log(`\n${result.appliedCount} migration(s) applied. (${elapsedMs}ms)`);
  }
}

run().catch(async (err) => {
  // #212 — formatMigrationFailure already renders SQLSTATE/detail/hint/
  // position/etc. and names the failing file when the error came from
  // runMigrations; a connection-level failure (e.g. the initial
  // client.connect()) won't have a filename, so fall back to the raw
  // message rather than mislabeling it as a specific migration.
  console.error(err instanceof Error && err.cause ? err.message : `Migration failed: ${(err as Error).message}`);
  await client.end().catch(() => {});
  process.exit(1);
});
