import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../infra/postgres/migrate.mjs';

/** Every suite owns a fresh schema in an explicitly disposable database. */
export async function testDatabase(t) {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL is required');
  const url = new URL(connectionString);
  assert.match(decodeURIComponent(url.pathname.slice(1)), /(?:^|_)test(?:_|$)/, 'refusing non-test database');
  const admin = new pg.Pool({ connectionString });
  const schema = `product_test_${randomUUID().replaceAll('-', '')}`;
  const setup = await admin.connect();
  try {
    await setup.query('BEGIN');
    await setup.query("SELECT pg_advisory_xact_lock(hashtext('tablesync.test_extension'))");
    await setup.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await setup.query('COMMIT');
  } finally { setup.release(); }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const pool = new pg.Pool({ connectionString: url.href });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await migrate({ connectionString: url.href });
  return { pool, connectionString: url.href, schema };
}
