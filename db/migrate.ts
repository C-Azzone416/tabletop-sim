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
];

async function run() {
  await client.connect();
  for (const file of migrations) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running ${file}...`);
    await client.query(content);
    console.log(`  ✓ ${file} applied`);
  }
  console.log('\nAll migrations complete.');
  await client.end();
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await client.end();
  process.exit(1);
});
