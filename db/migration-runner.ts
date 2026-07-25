import { readFileSync } from 'fs';
import { join } from 'path';

// #212 — the testable core of the migration runner: no top-level side
// effects (unlike db/migrate.ts, which connects to a real DB and exits the
// process), so this can be unit tested against a mock client with no
// database available.

export interface MigrationClient {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

// Shape of what pg/@neondatabase/serverless attach to a query error —
// SQLSTATE `code` plus whatever diagnostic fields Postgres included.
export interface PgErrorLike {
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  stack?: string;
}

// #212 — never log the full connection string (it carries credentials,
// and db/migrate.ts also receives it as argv[2] — process args, not just
// env). Host only; falls back to a fixed placeholder rather than throwing
// if the string doesn't parse as a URL.
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || '(empty host)';
  } catch {
    return '(unparseable connection string)';
  }
}

// #212 — a failed migration today prints one line: `err.message` alone.
// Postgres attaches far more on the error object; this renders all of it,
// with the failing filename first so `grep`ing logs for "Migration failed"
// always turns up which file, not just what Postgres said.
export function formatMigrationFailure(filename: string, err: unknown): string {
  const e = (err ?? {}) as PgErrorLike;
  const lines = [`Migration failed: ${filename}`];
  if (e.code) lines.push(`  SQLSTATE: ${e.code}`);
  lines.push(`  message: ${e.message ?? String(err)}`);

  const diagnosticFields: Array<[string, keyof PgErrorLike]> = [
    ['detail', 'detail'],
    ['hint', 'hint'],
    ['position', 'position'],
    ['where', 'where'],
    ['schema', 'schema'],
    ['table', 'table'],
    ['column', 'column'],
    ['constraint', 'constraint'],
  ];
  for (const [label, key] of diagnosticFields) {
    const value = e[key];
    if (value) lines.push(`  ${label}: ${value}`);
  }

  if (e.stack) lines.push(e.stack);
  return lines.join('\n');
}

export interface RunMigrationsOptions {
  readFile?: (path: string) => string;
  log?: (message: string) => void;
}

export interface RunMigrationsResult {
  appliedCount: number;
  pendingCount: number;
}

// #212 — apply + record are now one transaction per migration file
// (BEGIN; <migration DDL>; INSERT INTO _migrations; COMMIT). Previously
// these were two separate top-level queries: a process killed between them
// left the DDL applied but unrecorded, so the next boot re-ran it and
// failed pointing at the wrong migration (a "column already exists" error
// that looks nothing like the real fault). A killed process now leaves
// the transaction uncommitted — Postgres rolls it back itself — so the
// migration is cleanly still-pending, not applied-but-unrecorded.
export async function runMigrations(
  client: MigrationClient,
  migrationsDir: string,
  migrations: readonly string[],
  options: RunMigrationsOptions = {},
): Promise<RunMigrationsResult> {
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, 'utf-8'));
  const log = options.log ?? console.log;

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await client.query('SELECT name FROM _migrations');
  const appliedSet = new Set((applied as { name: string }[]).map(r => r.name));
  const pending = migrations.filter(file => !appliedSet.has(file));

  log(`${pending.length} pending migration(s) of ${migrations.length} total.`);

  let appliedCount = 0;
  for (const file of migrations) {
    if (appliedSet.has(file)) {
      log(`  ⏭ ${file} (already applied)`);
      continue;
    }

    const content = readFile(join(migrationsDir, file));
    log(`Running ${file}...`);

    try {
      await client.query('BEGIN');
      await client.query(content);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      // Best-effort — if the connection is already broken (e.g. the
      // process is being killed), the ROLLBACK itself may fail, but
      // Postgres discards an uncommitted transaction on disconnect
      // regardless, so the atomicity guarantee doesn't depend on this
      // succeeding.
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(formatMigrationFailure(file, err), { cause: err });
    }

    log(`  ✓ ${file} applied`);
    appliedCount++;
  }

  return { appliedCount, pendingCount: pending.length };
}
