import { readdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const defaultDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const quote = value => `"${value.replaceAll('"', '""')}"`;
const checksum = sql => createHash('sha256').update(sql).digest('hex');

async function schemaShape(client, schema) {
  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename <> 'schema_migrations' ORDER BY tablename", [schema]);
  const shape = {};
  for (const { tablename } of tables) {
    const { rows: columns } = await client.query(`
      SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
        a.attnotnull AS required, pg_get_expr(d.adbin,d.adrelid) AS default_value
      FROM pg_attribute a
      JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND t.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [schema, tablename]);
    const { rows: constraints } = await client.query(`
      SELECT c.contype, c.conkey, r.relname AS referenced_table, c.confkey,
        c.confupdtype, c.confdeltype, c.confmatchtype, c.condeferrable, c.condeferred, c.convalidated,
        CASE WHEN c.contype='c' THEN pg_get_expr(c.conbin,c.conrelid) END AS expression
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class r ON r.oid=c.confrelid
      WHERE n.nspname=$1 AND t.relname=$2`, [schema, tablename]);
    shape[tablename] = { columns, constraints: constraints.map(c => JSON.stringify(c)).sort() };
  }
  return shape;
}

// Inspect a transactional copy of the original schema. No existing rows change.
async function validateBaseline(client, schema, sql) {
  const existing = await schemaShape(client, schema);
  const inspection = `baseline_${randomUUID().replaceAll('-', '')}`;
  await client.query('SAVEPOINT baseline_inspection');
  await client.query(`CREATE SCHEMA ${quote(inspection)}`);
  await client.query(`SET LOCAL search_path TO ${quote(inspection)}, public`);
  await client.query(sql);
  const expected = await schemaShape(client, inspection);
  await client.query('ROLLBACK TO SAVEPOINT baseline_inspection');
  for (const [table, definition] of Object.entries(expected)) {
    if (JSON.stringify(existing[table]) !== JSON.stringify(definition)) {
      throw new Error(`Existing schema mismatch for ${table}; inspect and reconcile before baselining`);
    }
  }
}

export async function migrate({ connectionString = process.env.DATABASE_URL,
  directory = process.env.MIGRATIONS_DIR ?? defaultDirectory, baseline = false,
  backupConfirmed = process.env.BASELINE_BACKUP_CONFIRMED === 'yes' } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (baseline && !backupConfirmed) throw new Error('Baseline requires a verified backup and BASELINE_BACKUP_CONFIRMED=yes');
  const names = (await readdir(directory)).filter(name => /^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('No numbered SQL migrations found');
  if (new Set(names.map(n => n.slice(0, 3))).size !== names.length) throw new Error('Duplicate migration version');
  const migrations = await Promise.all(names.map(async filename => {
    const sql = await readFile(resolve(directory, filename), 'utf8');
    return { filename, sql, checksum: checksum(sql) };
  }));
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    // One session lock serializes history inspection, DDL, and ledger writes.
    await client.query("SELECT pg_advisory_lock(hashtext('tablesync.schema_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows: applied } = await client.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename');
    for (const row of applied) {
      const current = migrations.find(m => m.filename === row.filename);
      if (!current) throw new Error(`Applied migration missing from directory: ${row.filename}`);
      if (current.checksum !== row.checksum) throw new Error(`Applied migration checksum mismatch: ${row.filename}`);
    }
    const appliedNames = new Set(applied.map(row => row.filename));
    if (applied.length && migrations.some(m => !appliedNames.has(m.filename) && m.filename < applied.at(-1).filename)) {
      throw new Error('New migration precedes applied history; add a higher version instead');
    }
    const { rows: [{ schema }] } = await client.query('SELECT current_schema() AS schema');
    const { rows: existing } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename <> 'schema_migrations'", [schema]);
    if (!applied.length && existing.length && !baseline) {
      throw new Error('Existing schema has no migration ledger; back up, inspect, and use --baseline explicitly');
    }
    if (baseline && applied.length) throw new Error('Baseline is only allowed before migration history exists');
    let baselineVerified = false;
    const completed = [];
    for (const migration of migrations) {
      if (appliedNames.has(migration.filename)) continue;
      await client.query('BEGIN');
      try {
        if (baseline && !baselineVerified && existing.length) {
          if (migration.filename !== '001-initial-schema.sql') throw new Error('Baseline requires the original 001 schema');
          await validateBaseline(client, schema, migration.sql);
          baselineVerified = true;
        } else {
          await client.query(migration.sql);
        }
        await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [migration.filename, migration.checksum]);
        await client.query('COMMIT');
        completed.push(migration.filename);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return completed;
  } finally {
    // Closing also releases the advisory lock after errors.
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.some(arg => arg !== '--baseline')) throw new Error('Usage: node infra/postgres/migrate.mjs [--baseline]');
    const completed = await migrate({ baseline: args.includes('--baseline') });
    console.log(completed.length ? `Applied: ${completed.join(', ')}` : 'Migrations already current');
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}
