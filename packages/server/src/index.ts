import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

// #140 — deploy-time auto-migrate, baked into the real entrypoint rather
// than an npm `prestart` lifecycle hook, so it runs regardless of whether
// the platform's Start Command is `npm start` or `node dist/index.js`
// directly (can't be verified from the repo — Render's Start Command is
// dashboard-only config). Runs the same idempotent runner used for the
// manual staging fix; a failed migration is a loud, fatal boot error, not a
// silent skip — better to refuse to serve than serve against a stale schema.
// __dirname here is dist/ (this file's tsc output, CommonJS) — ../../../db
// resolves to the repo-root db/ directory regardless of cwd.
function runMigrationsOrExit(): void {
  if (!process.env.DATABASE_URL) return; // buildApp's own DB client surfaces this error
  const migrateScript = join(__dirname, '../../../db/migrate.ts');
  const result = spawnSync('npx', ['tsx', migrateScript], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error('[server] Migration failed — refusing to start');
    process.exit(1);
  }
}

async function start() {
  runMigrationsOrExit();
  const app = await buildApp();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server listening on port ${PORT}`);
}

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection:', err);
  process.exit(1);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
