import Fastify from 'fastify';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const sessionUrl = process.env.SESSION_SERVICE_URL ?? 'http://localhost:8081';
const menu = [{ id: 'dumplings', name: 'Crispy corn dumplings', price: 260, emoji: '🥟' }, { id: 'paneer', name: 'Smoked butter paneer', price: 340, emoji: '🍛' }, { id: 'noodles', name: 'Chilli garlic noodles', price: 280, emoji: '🍜' }, { id: 'milk-cake', name: 'Saffron milk cake', price: 190, emoji: '🍮' }];
let broker;

async function cartFor(sessionId) {
  const found = await database.query('SELECT id FROM carts WHERE session_id=$1', [sessionId]);
  if (found.rowCount) return found.rows[0];
  const cart = { id: randomUUID() };
  await database.query('INSERT INTO carts (id,session_id) VALUES ($1,$2)', [cart.id, sessionId]);
  return cart;
}
const envelope = (type, data, correlationId = randomUUID()) => ({ id: randomUUID(), version: 1, occurredAt: new Date().toISOString(), correlationId, type, data });
async function publish(type, data, correlationId) {
  if (!broker) return;
  broker.publish('tablesync.events', type, Buffer.from(JSON.stringify(envelope(type, data, correlationId))), { persistent: true });
  await broker.waitForConfirms();
}
async function sessionFor(sessionId) {
  const response = await fetch(`${sessionUrl}/v1/sessions/id/${sessionId}`);
  if (!response.ok) throw new Error(`session ${sessionId} is unavailable`);
  return response.json();
}
async function orderView(orderId) {
  const order = await database.query('SELECT id, payment_saga_id AS "paymentSagaId", session_id AS "sessionId", restaurant_name AS "restaurantName", table_name AS "tableName", status, total_amount AS "totalAmount", created_at AS "createdAt" FROM consolidated_orders WHERE id=$1', [orderId]);
  if (!order.rowCount) return null;
  const items = await database.query('SELECT id, menu_item_id AS "menuItemId", item_name AS name, unit_price AS price, emoji, quantity FROM consolidated_order_items WHERE order_id=$1 ORDER BY created_at', [orderId]);
  return { ...order.rows[0], items: items.rows };
}

export function isCommittedPaymentEvent(event) {
  return event?.version === 1 && event?.type === 'payment.saga_committed.v1' && typeof event.id === 'string' && typeof event.correlationId === 'string' && typeof event.data?.sagaId === 'string' && typeof event.data?.sessionId === 'string' && Number.isInteger(event.data?.totalAmount) && event.data.totalAmount > 0;
}
export async function projectCommittedPayment(event) {
  if (!isCommittedPaymentEvent(event)) throw new Error('invalid committed payment event');
  const session = await sessionFor(event.data.sessionId);
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const received = await client.query('INSERT INTO order_consumed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id', [event.id]);
    if (!received.rowCount) { await client.query('COMMIT'); return null; }
    const existing = await client.query('SELECT id FROM consolidated_orders WHERE payment_saga_id=$1', [event.data.sagaId]);
    if (existing.rowCount) { await client.query('COMMIT'); return orderView(existing.rows[0].id); }
    const cart = await client.query('SELECT id FROM carts WHERE session_id=$1', [event.data.sessionId]);
    if (!cart.rowCount) throw new Error('committed payment has no cart');
    const items = await client.query('SELECT menu_item_id, item_name, unit_price, emoji, quantity FROM cart_items WHERE cart_id=$1 ORDER BY created_at', [cart.rows[0].id]);
    if (!items.rowCount) throw new Error('committed payment has an empty cart');
    const orderId = randomUUID();
    const totalAmount = items.rows.reduce((total, item) => total + item.unit_price * item.quantity, 0);
    if (totalAmount !== event.data.totalAmount) throw new Error('cart total does not match committed payment');
    await client.query('INSERT INTO consolidated_orders (id,payment_saga_id,session_id,restaurant_name,table_name,status,total_amount) VALUES ($1,$2,$3,$4,$5,$6,$7)', [orderId, event.data.sagaId, event.data.sessionId, session.restaurant, session.tableName, 'CONFIRMED', totalAmount]);
    for (const item of items.rows) await client.query('INSERT INTO consolidated_order_items (id,order_id,menu_item_id,item_name,unit_price,emoji,quantity) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), orderId, item.menu_item_id, item.item_name, item.unit_price, item.emoji, item.quantity]);
    await client.query('INSERT INTO order_outbox (id,event_type,correlation_id,payload) VALUES ($1,$2,$3,$4)', [randomUUID(), 'order.confirmed.v1', event.correlationId, JSON.stringify({ orderId, sessionId: event.data.sessionId, restaurantName: session.restaurant, totalAmount })]);
    await client.query('COMMIT');
    return orderView(orderId);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
async function flushOutbox() {
  if (!broker) return;
  const pending = await database.query('SELECT id, event_type AS "eventType", correlation_id AS "correlationId", payload FROM order_outbox WHERE published_at IS NULL ORDER BY created_at');
  for (const event of pending.rows) { await publish(event.eventType, event.payload, event.correlationId); await database.query('UPDATE order_outbox SET published_at=now() WHERE id=$1', [event.id]); }
}
async function handlePaymentEvent(message) {
  if (!message) return;
  try {
    const event = JSON.parse(message.content.toString());
    if (isCommittedPaymentEvent(event)) { await projectCommittedPayment(event); await flushOutbox(); }
    broker.ack(message);
  } catch (error) { console.error('order payment-event projection failed', error); broker.nack(message, false, true); }
}

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'order', status: 'ok', rabbitmq: Boolean(broker) }; });
  app.get('/v1/carts/:sessionId', async request => {
    const cart = await cartFor(request.params.sessionId);
    const items = await database.query('SELECT id,menu_item_id AS "menuItemId",owner_id AS "ownerId",item_name AS name,unit_price AS price,emoji,quantity FROM cart_items WHERE cart_id=$1 ORDER BY created_at', [cart.id]);
    return { ...cart, sessionId: request.params.sessionId, items: items.rows, subtotal: items.rows.reduce((total, item) => total + item.price * item.quantity, 0) };
  });
  app.post('/v1/carts/:sessionId/items', async (request, reply) => {
    const { participantId, menuItemId } = request.body ?? {}; const item = menu.find(entry => entry.id === menuItemId);
    if (!participantId || !item) return reply.code(400).send({ error: 'participantId and valid menuItemId are required' });
    let session; try { session = await sessionFor(request.params.sessionId); } catch { return reply.code(503).send({ error: 'session service unavailable' }); }
    if (!session.participants.some(participant => participant.id === participantId)) return reply.code(403).send({ error: 'participant is not part of this table session' });
    const cart = await cartFor(request.params.sessionId);
    await database.query('INSERT INTO cart_items (id,cart_id,menu_item_id,owner_id,item_name,unit_price,emoji,quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,1) ON CONFLICT (cart_id,menu_item_id,owner_id) DO UPDATE SET quantity=cart_items.quantity+1', [randomUUID(), cart.id, item.id, participantId, item.name, item.price, item.emoji]);
    await publish('cart.item_added.v1', { sessionId: request.params.sessionId, item: { menuItemId, ownerId: participantId } });
    return app.inject({ method: 'GET', url: `/v1/carts/${request.params.sessionId}` }).then(response => response.json());
  });
  app.get('/v1/orders/:id', async (request, reply) => (await orderView(request.params.id)) ?? reply.code(404).send({ error: 'order not found' }));
  app.get('/v1/orders', async request => {
    const { sessionId, restaurantName } = request.query ?? {}; const filters = []; const values = [];
    if (sessionId) { values.push(sessionId); filters.push(`session_id=$${values.length}`); }
    if (restaurantName) { values.push(restaurantName); filters.push(`restaurant_name=$${values.length}`); }
    const orders = await database.query(`SELECT id FROM consolidated_orders${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''} ORDER BY created_at DESC`, values);
    return Promise.all(orders.rows.map(order => orderView(order.id)));
  });
  return app;
}
async function start() {
  await database.query('SELECT 1');
  const connection = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
  broker = await connection.createConfirmChannel();
  await broker.assertExchange('tablesync.events', 'topic', { durable: true });
  await broker.assertQueue('tablesync.audit', { durable: true }); await broker.bindQueue('tablesync.audit', 'tablesync.events', '#');
  await broker.assertQueue('tablesync.order.payment.v1', { durable: true }); await broker.bindQueue('tablesync.order.payment.v1', 'tablesync.events', 'payment.saga_committed.v1');
  await broker.prefetch(1); await flushOutbox(); await broker.consume('tablesync.order.payment.v1', handlePaymentEvent);
  await buildApp().listen({ port: Number(process.env.PORT ?? 8082), host: '0.0.0.0' });
}
if (process.argv[1]?.endsWith('server.js')) start();
