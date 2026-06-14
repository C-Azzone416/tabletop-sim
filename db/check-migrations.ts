import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');
const migrateFile = join(__dirname, 'migrate.ts');

// Read all .sql files from the migrations directory
const sqlFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

// Parse the migrations array from migrate.ts
const migrateSource = readFileSync(migrateFile, 'utf-8');
const match = migrateSource.match(/const migrations\s*=\s*\[([\s\S]*?)\]/);
if (!match) {
  console.error('ERROR: Could not find migrations array in db/migrate.ts');
  process.exit(1);
}

const registeredFiles = new Set(
  [...match[1].matchAll(/'([^']+\.sql)'/g)].map(m => m[1])
);

const missing = sqlFiles.filter(f => !registeredFiles.has(f));

if (missing.length > 0) {
  console.error('ERROR: The following migration files are not registered in db/migrate.ts:');
  for (const f of missing) {
    console.error(`  - ${f}`);
  }
  console.error('\nAdd them to the migrations array in db/migrate.ts.');
  process.exit(1);
}

console.log(`OK: All ${sqlFiles.length} migration(s) registered in db/migrate.ts.`);
