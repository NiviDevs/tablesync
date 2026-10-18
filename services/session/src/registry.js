import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
export function canonicalCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (code.length > 40 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) fail(400, 'INVALID_TABLE_CODE', 'A valid table code is required');
  return code;
}

export function createRegistry({ pool, orderClient }) {
  async function present(db, table, session) {
    const participants = session ? (await db.query(
      'SELECT id,display_name AS name FROM participants WHERE session_id=$1 ORDER BY joined_at,id', [session.id])).rows : [];
    return { code: table.code, name: table.name, restaurantId: table.restaurant_id,
      session: session ? { id: session.id, status: session.status, openedAt: new Date(session.created_at).toISOString(), participants } : null };
  }
  async function tableView(db, code) {
    const table = (await db.query('SELECT * FROM physical_tables WHERE code=$1', [code])).rows[0];
    if (!table) fail(404, 'TABLE_NOT_FOUND', 'This table link is not active');
    const session = (await db.query("SELECT * FROM table_sessions WHERE table_code=$1 AND status IN ('OPEN','CLOSING')", [code])).rows[0];
    return present(db, table, session);
  }
  async function getTable(code) { return tableView(pool, canonicalCode(code)); }
  async function getSession(id, db = pool) {
    if (!uuid.test(id)) fail(400, 'INVALID_SESSION_ID', 'A valid session ID is required');
    const session = (await db.query('SELECT * FROM table_sessions WHERE id=$1', [id])).rows[0];
    if (!session) fail(404, 'SESSION_NOT_FOUND', 'Session not found');
    const table = (await db.query('SELECT * FROM physical_tables WHERE code=$1', [session.table_code])).rows[0];
    return present(db, table, session);
  }
  async function joinTable({ code: inputCode, name: inputName, joinKey }) {
    const code = canonicalCode(inputCode);
    const name = typeof inputName === 'string' ? inputName.trim() : '';
    if (!name || [...name].length > 80 || !uuid.test(joinKey)) fail(400, 'INVALID_JOIN', 'Name (1–80 characters) and UUID joinKey are required');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // A global join key must serialize even when competing requests use different tables.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [joinKey]);
      const previous = (await client.query(`SELECT p.id,p.session_id,p.display_name,s.table_code,s.status
        FROM participants p JOIN table_sessions s ON s.id=p.session_id WHERE p.join_key=$1`, [joinKey])).rows[0];
      if (previous && (previous.display_name !== name || previous.table_code !== code)) fail(409, 'JOIN_KEY_CONFLICT', 'Join key already belongs to a different name or table');
      const table = (await client.query('SELECT * FROM physical_tables WHERE code=$1 FOR UPDATE', [code])).rows[0];
      if (!table) fail(404, 'TABLE_NOT_FOUND', 'This table link is not active');
      if (previous) {
        const current = await tableView(client, code);
        if (current.session?.id !== previous.session_id || current.session.status !== 'OPEN') fail(409, 'SESSION_NOT_OPEN', 'This seating is no longer open; start a new join');
        const result = { table: current, participant: { id: previous.id, name }, replayed: true };
        await client.query('COMMIT');
        return result;
      }
      let session = (await client.query("SELECT * FROM table_sessions WHERE table_code=$1 AND status IN ('OPEN','CLOSING')", [code])).rows[0];
      if (session && session.status !== 'OPEN') fail(409, 'SESSION_NOT_OPEN', 'This seating is closing');
      if (!session) {
        session = (await client.query(`INSERT INTO table_sessions(id,table_code,restaurant_name,table_name,restaurant_id)
          SELECT $1,$2,r.name,$3,$4 FROM restaurants r WHERE r.id=$4 RETURNING *`, [randomUUID(), code, table.name, table.restaurant_id])).rows[0];
      }
      const participant = { id: randomUUID(), name };
      await client.query('INSERT INTO participants(id,session_id,display_name,join_key) VALUES($1,$2,$3,$4)',
        [participant.id, session.id, name, joinKey]);
      const result = { table: await present(client, table, session), participant, replayed: false };
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function listTables(restaurantId) {
    if (!uuid.test(restaurantId)) fail(400, 'INVALID_RESTAURANT_ID', 'A valid restaurant ID is required');
    const tables = await pool.query('SELECT code FROM physical_tables WHERE restaurant_id=$1 ORDER BY code', [restaurantId]);
    return Promise.all(tables.rows.map(t => tableView(pool, t.code)));
  }
  async function createTable({ restaurantId, name, ...extra }) {
    if (Object.keys(extra).length || !uuid.test(restaurantId) || typeof name !== 'string' || !name.trim() || [...name.trim()].length > 80) {
      fail(400, 'INVALID_TABLE', 'Provide a table name between 1 and 80 characters');
    }
    const code = `JH-${randomUUID().slice(0, 8).toUpperCase()}`;
    await pool.query('INSERT INTO physical_tables(code,restaurant_id,name) VALUES($1,$2,$3)', [code, restaurantId, name.trim()]);
    return getTable(code);
  }
  async function removeTable({ restaurantId, code: inputCode }) {
    const code = canonicalCode(inputCode);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const table = (await client.query('SELECT * FROM physical_tables WHERE code=$1 AND restaurant_id=$2 FOR UPDATE', [code, restaurantId])).rows[0];
      if (!table) fail(404, 'TABLE_NOT_FOUND', 'Table not found for this restaurant');
      if ((await client.query('SELECT id FROM table_sessions WHERE table_code=$1 LIMIT 1', [code])).rowCount) {
        fail(409, 'TABLE_HAS_HISTORY', 'This table has seating history. Close its seating to make it available again.');
      }
      await client.query('DELETE FROM physical_tables WHERE code=$1', [code]);
      await client.query('COMMIT');
      return { removed: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function closeSession({ sessionId, restaurantId }) {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [`close:${sessionId}`]);
      const table = await getSession(sessionId, client);
      if (table.restaurantId !== restaurantId) fail(403, 'RESTAURANT_SCOPE_MISMATCH', 'Seating belongs to another restaurant');
      if (table.session.status === 'CLOSED') return table;
      await client.query('BEGIN');
      try {
        await client.query('SELECT code FROM physical_tables WHERE code=$1 FOR UPDATE', [table.code]);
        await client.query("UPDATE table_sessions SET status='CLOSING' WHERE id=$1 AND status='OPEN'", [sessionId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      try { await orderClient.sealSession(sessionId); }
      catch (error) {
        if (error.statusCode === 409) {
          await client.query("UPDATE table_sessions SET status='OPEN' WHERE id=$1 AND status='CLOSING'", [sessionId]);
          throw error;
        }
        fail(503, 'CLOSE_PENDING', 'Closure outcome is uncertain; retry to finish closing');
      }
      await client.query("UPDATE table_sessions SET status='CLOSED',closed_at=COALESCE(closed_at,now()) WHERE id=$1 AND status='CLOSING'", [sessionId]);
      return getSession(sessionId, client);
    } finally {
      try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`close:${sessionId}`]); }
      finally { client.release(); }
    }
  }
  return { getTable, joinTable, getSession, listTables, createTable, removeTable, closeSession };
}
