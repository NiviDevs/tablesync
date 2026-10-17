import Fastify from 'fastify';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createCartStore } from './src/cart.js';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const sessionUrl = process.env.SESSION_SERVICE_URL ?? 'http://localhost:8081';
let broker;
const rabbitUrl = process.env.RABBITMQ_URL ?? `amqp://${encodeURIComponent(process.env.RABBITMQ_DEFAULT_USER ?? 'guest')}:${encodeURIComponent(process.env.RABBITMQ_DEFAULT_PASS ?? 'guest')}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;

const envelope = (type, data, correlationId = randomUUID()) => ({ id: randomUUID(), version: 1, occurredAt: new Date().toISOString(), correlationId, type, data });
async function publish(type, data, correlationId) {
  if (!broker) return;
  broker.publish('tablesync.events', type, Buffer.from(JSON.stringify(envelope(type, data, correlationId))), { persistent: true });
  await broker.waitForConfirms();
}
async function tableFor(sessionId) {
  const response = await fetch(`${sessionUrl}/v1/sessions/id/${sessionId}`, { headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` }, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw Object.assign(new Error('Session is unavailable'), { statusCode: response.status, code: 'SESSION_UNAVAILABLE' });
  return response.json();
}
async function sessionFor(sessionId) {
  const table = await tableFor(sessionId);
  return { id: table.session.id, tableCode: table.code, restaurant: 'Juniper House', tableName: table.name, participants: table.session.participants };
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
  app.addHook('onRequest', async (request, reply) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (request.url.startsWith('/v1/') && (!secret || request.headers.authorization !== `Bearer ${secret}`)) {
      return reply.code(secret ? 401 : 503).send({ error: { code: 'INTERNAL_AUTH_REQUIRED', message: 'Private service credential required' }, requestId: request.id });
    }
  });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'order', status: 'ok', rabbitmq: Boolean(broker) }; });
  const cartStore = createCartStore({ pool: database, sessionClient: tableFor });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503;
    if (status >= 500) request.log.error({ err: error }, 'order request failed');
    reply.code(status).send({ error: { code: error.code ?? 'ORDER_UNAVAILABLE', message: status >= 500 ? 'Order service is unavailable' : error.message }, requestId: request.id });
  });
  app.get('/v1/menu', request => cartStore.listMenu(request.headers['x-restaurant-id']));
  app.get('/v1/sessions/:id/cart', request => cartStore.readCart(request.params.id));
  app.put('/v1/sessions/:id/cart/items/:menuItemId', request => cartStore.setQuantity({ ...request.body,
    sessionId: request.params.id, menuItemId: request.params.menuItemId, participantId: request.headers['x-participant-id'] }));
  app.delete('/v1/sessions/:id/cart/items/:menuItemId', request => cartStore.removeItem({ ...request.body,
    sessionId: request.params.id, menuItemId: request.params.menuItemId, participantId: request.headers['x-participant-id'] }));
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
  const connection = await amqp.connect(rabbitUrl);
  broker = await connection.createConfirmChannel();
  await broker.assertExchange('tablesync.events', 'topic', { durable: true });
  await broker.assertQueue('tablesync.audit', { durable: true }); await broker.bindQueue('tablesync.audit', 'tablesync.events', '#');
  await broker.assertQueue('tablesync.order.payment.v1', { durable: true }); await broker.bindQueue('tablesync.order.payment.v1', 'tablesync.events', 'payment.saga_committed.v1');
  await broker.prefetch(1); await flushOutbox(); await broker.consume('tablesync.order.payment.v1', handlePaymentEvent);
  await buildApp().listen({ port: Number(process.env.PORT ?? 8082), host: '0.0.0.0' });
}
if (process.argv[1]?.endsWith('server.js')) start();
