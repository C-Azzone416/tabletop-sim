import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

let sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

if (isLocal) {
  const pool = new Pool({ connectionString: databaseUrl });
  sql = async (strings, ...values) => {
    const text = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
    const result = await pool.query(text, values as unknown[]);
    return result.rows;
  };
} else {
  sql = neon(databaseUrl) as typeof sql;
}

export { sql };
