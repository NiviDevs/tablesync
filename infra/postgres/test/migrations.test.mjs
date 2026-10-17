import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, 'TEST_DATABASE_URL must name a disposable PostgreSQL database');
assert.match(decodeURIComponent(new URL(connectionString).pathname.slice(1)), /(?:^|_)test(?:_|$)/, 'refusing a database without a test name');
const runner = fileURLToPath(new URL('../migrate.mjs', import.meta.url));
const realMigrations = fileURLToPath(new URL('../migrations/', import.meta.url));

async function fixture(t, real = false) {
  const admin = new pg.Pool({ connectionString });
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  const setup = await admin.connect();
  try {
    await setup.query('BEGIN');
    await setup.query("SELECT pg_advisory_xact_lock(hashtext('tablesync.test_extension'))");
    await setup.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await setup.query('COMMIT');
  } finally { setup.release(); }
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const pool = new pg.Pool({ connectionString: url.href });
  const directory = await mkdtemp(join(tmpdir(), 'tablesync-migrations-'));
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true });
  });
  const migrations = real ? realMigrations : directory;
  if (!real) await writeFile(join(directory, '001-fixture.sql'), 'CREATE TABLE fixture(id int PRIMARY KEY); INSERT INTO fixture VALUES (1);');
  function run(extraEnv = {}, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runner, ...args], {
        env: { ...process.env, DATABASE_URL: url.href, MIGRATIONS_DIR: migrations, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', value => { output += value; });
      child.stderr.on('data', value => { output += value; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output }));
    });
  }
  return { pool, directory, run };
}

test('real migrations run twice without changing persisted rows', async t => {
  const f = await fixture(t, true);
  assert.equal((await f.run()).code, 0);
  await f.pool.query("INSERT INTO table_sessions(id,table_code,restaurant_name,table_name) VALUES(gen_random_uuid(),'SAGE-12','Juniper House','Table 12')");
  const before = (await f.pool.query('SELECT * FROM table_sessions')).rows;
  assert.equal((await f.run()).code, 0);
  assert.deepEqual((await f.pool.query('SELECT * FROM table_sessions')).rows, before);
  assert.deepEqual((await f.pool.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map(r => r.filename),
    (await readdir(realMigrations)).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort());
});

test('concurrent runners apply a non-idempotent migration once', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.run(), f.run(), f.run()]);
  for (const result of results) assert.equal(result.code, 0, result.output);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM fixture')).rows[0].count, 1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
});

test('modified applied SQL fails before any later migration runs', async t => {
  const f = await fixture(t);
  assert.equal((await f.run()).code, 0);
  await writeFile(join(f.directory, '001-fixture.sql'), 'SELECT 42;');
  await writeFile(join(f.directory, '002-later.sql'), 'CREATE TABLE forbidden(id int);');
  const result = await f.run();
  assert.notEqual(result.code, 0);
  assert.match(result.output, /checksum/i);
  assert.equal((await f.pool.query("SELECT to_regclass('forbidden') AS table_name")).rows[0].table_name, null);
});

test('failed SQL rolls back both data and ledger entry', async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, '001-fixture.sql'), 'CREATE TABLE partial(id int); SELECT missing_column;');
  assert.notEqual((await f.run()).code, 0);
  assert.equal((await f.pool.query("SELECT to_regclass('partial') AS table_name")).rows[0].table_name, null);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 0);
});

test('existing service schema requires explicit backup acknowledgement and validated baseline', async t => {
  const f = await fixture(t, true);
  const initial = await readFile(new URL('../init.sql', import.meta.url), 'utf8');
  await f.pool.query(initial);
  await f.pool.query("INSERT INTO table_sessions(id,table_code,restaurant_name,table_name) VALUES(gen_random_uuid(),'SAGE-12','Juniper House','Table 12')");
  const before = (await f.pool.query('SELECT id,table_code,restaurant_name,table_name,created_at FROM table_sessions')).rows;
  const denied = await f.run();
  assert.notEqual(denied.code, 0);
  assert.match(denied.output, /baseline/i);
  assert.notEqual((await f.run({}, ['--baseline'])).code, 0);
  const baseline = await f.run({ BASELINE_BACKUP_CONFIRMED: 'yes' }, ['--baseline']);
  assert.equal(baseline.code, 0, baseline.output);
  assert.deepEqual((await f.pool.query('SELECT id,table_code,restaurant_name,table_name,created_at FROM table_sessions')).rows, before);
  assert.equal((await f.run()).code, 0);
});

test('baseline rejects a drifted existing schema without recording history', async t => {
  const f = await fixture(t, true);
  await f.pool.query(await readFile(new URL('../init.sql', import.meta.url), 'utf8'));
  await f.pool.query('ALTER TABLE cart_items DROP CONSTRAINT cart_items_quantity_check');
  const result = await f.run({ BASELINE_BACKUP_CONFIRMED: 'yes' }, ['--baseline']);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /schema.*mismatch/i);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 0);
});

test('legacy rupees convert to paise once while original columns remain intact', async t => {
  const f = await fixture(t, true);
  await f.pool.query(await readFile(new URL('../init.sql', import.meta.url), 'utf8'));
  const sessionId = randomUUID();
  const cartId = randomUUID();
  await f.pool.query("INSERT INTO table_sessions(id,table_code,restaurant_name,table_name) VALUES($1,'SAGE-12','Juniper House','Table 12')", [sessionId]);
  await f.pool.query('INSERT INTO carts(id,session_id) VALUES($1,$2)', [cartId, sessionId]);
  await f.pool.query("INSERT INTO cart_items(id,cart_id,menu_item_id,owner_id,item_name,unit_price,emoji,quantity) VALUES($1,$2,'paneer',$3,'Paneer',340,'🍛',1)", [randomUUID(), cartId, randomUUID()]);
  const result = await f.run({ BASELINE_BACKUP_CONFIRMED: 'yes' }, ['--baseline']);
  assert.equal(result.code, 0, result.output);
  assert.equal((await f.run()).code, 0);
  assert.deepEqual((await f.pool.query('SELECT unit_price,unit_price_minor FROM cart_items')).rows, [{ unit_price: 340, unit_price_minor: 34000 }]);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM money_unit_migrations')).rows[0].count, 1);
});
