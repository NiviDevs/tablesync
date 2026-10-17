import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../src/registry.js';

test('known and unknown table reads never create seating sessions', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const before = (await pool.query('SELECT count(*) FROM table_sessions')).rows;
  assert.equal((await registry.getTable('sage-12')).session, null);
  await assert.rejects(registry.getTable('UNKNOWN-99'), { statusCode: 404 });
  assert.deepEqual((await pool.query('SELECT count(*) FROM table_sessions')).rows, before);
});

test('ten simultaneous first joins create exactly one active seating', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => registry.joinTable({ code: 'SAGE-12', name: `Guest ${i}`, joinKey: randomUUID() })));
  assert.equal(new Set(results.map(r => r.table.session.id)).size, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM table_sessions')).rows[0].count, 1);
  assert.equal((await registry.getTable('SAGE-12')).session.participants.length, 10);
});

test('join keys replay safely and cannot change identity or table', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const input = { code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() };
  const [first, second] = await Promise.all([registry.joinTable(input), registry.joinTable(input)]);
  assert.equal(first.participant.id, second.participant.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM participants')).rows[0].count, 1);
  await assert.rejects(registry.joinTable({ ...input, name: 'Another name' }), { statusCode: 409 });
  await assert.rejects(registry.joinTable({ ...input, code: 'UNKNOWN-99' }), { statusCode: 409 });
  await assert.rejects(registry.joinTable({ ...input, joinKey: 'client-id' }), { statusCode: 400 });
});
