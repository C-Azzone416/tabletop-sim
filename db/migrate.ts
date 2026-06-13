import { Client } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DATABASE_URL = process.argv[2];

if (!DATABASE_URL) {
  console.error('Usage: npx tsx db/migrate.ts <DATABASE_URL>');
  process.exit(1);
}

const client = new Client(DATABASE_URL);
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
];

async function run() {
  await client.connect();

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
  await client.end();
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await client.end();
  process.exit(1);
});
