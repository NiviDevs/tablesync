export function createOutbox({ pool, getChannel, afterConfirm = () => {} }) {
  let flushing = false;
  async function flushOutbox() {
    const channel = getChannel();
    if (!channel || flushing) return;
    flushing = true;
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const pending = await client.query('SELECT id,envelope FROM payment_outbox WHERE published_at IS NULL ORDER BY created_at,id LIMIT 50 FOR UPDATE SKIP LOCKED');
      for (const event of pending.rows) {
        channel.publish('tablesync.events', event.envelope.type, Buffer.from(JSON.stringify(event.envelope)), { persistent: true, messageId: event.id, contentType: 'application/json' });
        let timer;
        try {
          await Promise.race([channel.waitForConfirms(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Broker confirm timeout')), 4000); })]);
        } finally { clearTimeout(timer); }
        await afterConfirm(event.envelope);
        await client.query('UPDATE payment_outbox SET published_at=now() WHERE id=$1', [event.id]);
      }
      await client.query('COMMIT');
    } catch (error) { if (client) await client.query('ROLLBACK'); throw error; }
    finally { client?.release(); flushing = false; }
  }
  return { flushOutbox };
}
