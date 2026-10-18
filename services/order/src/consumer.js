/** Permanent bad input goes to RabbitMQ's configured dead-letter queue. */
export async function processPaymentDelivery(message, { channel, project, queue = 'tablesync.order.payment.v2' }) {
  if (!message) return;
  let event;
  try { event = JSON.parse(message.content.toString()); }
  catch { channel.nack(message, false, false); return; }
  if (event?.version === 1) {
    console.info('Order v2 projection excluded a legacy v1 event');
    channel.ack(message); return;
  }
  try {
    await project(event);
    channel.ack(message);
  } catch (error) {
    const attempt = Number(message.properties?.headers?.['x-tablesync-attempt'] ?? 0);
    if (error.permanent || !Number.isInteger(attempt) || attempt >= 3) { channel.nack(message, false, false); return; }
    try {
      channel.sendToQueue(queue, message.content, { persistent: true, messageId: event?.id,
        headers: { 'x-tablesync-attempt': attempt + 1 } });
      await channel.waitForConfirms();
      channel.ack(message);
    } catch {
      // Leave unacknowledged on a broken channel; recovery redelivers it.
      console.error('Order retry publication failed; delivery remains unacknowledged');
    }
  }
}
