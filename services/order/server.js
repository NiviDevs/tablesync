import Fastify from 'fastify';
import amqp from 'amqplib';
import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { createCartStore } from './src/cart.js';
import { createCheckoutStore } from './src/checkout.js';
import { createOutbox } from './src/outbox.js';
import { processPaymentDelivery } from './src/consumer.js';
export { isCommittedPaymentEvent } from './src/checkout.js';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const sessionUrl = process.env.SESSION_SERVICE_URL ?? 'http://localhost:8081';
const paymentUrl = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:8083';
const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
let connection;
let broker;
async function privateJson(base, path, body) {
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
  if (response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message ?? 'Private service is unavailable'), { statusCode: response.status, code: result.error?.code });
  return result;
}
async function tableFor(id) {
  const result = await privateJson(sessionUrl, `/v1/sessions/id/${id}`);
  if (!result) throw Object.assign(new Error('Session not found'), { statusCode: 404, code: 'SESSION_NOT_FOUND' });
  return result;
}
const cartStore = createCartStore({ pool: database, sessionClient: tableFor });
const checkoutStore = createCheckoutStore({ pool: database, sessionClient: tableFor, paymentClient: {
  getByCheckout: id => privateJson(paymentUrl, `/v1/payment-sagas/by-checkout/${id}`),
  persistSaga: body => privateJson(paymentUrl, '/v1/payment-sagas', body),
} });
const outbox = createOutbox({ pool: database, getChannel: () => broker });

export function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (request.url.startsWith('/v1/') && (!secret || request.headers.authorization !== `Bearer ${secret}`)) {
      return reply.code(secret ? 401 : 503).send({ error: { code: 'INTERNAL_AUTH_REQUIRED', message: 'Private service credential required' }, requestId: request.id });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503;
    if (status >= 500) request.log.error({ err: error }, 'order request failed');
    reply.code(status).send({ error: { code: error.code ?? 'ORDER_UNAVAILABLE', message: status >= 500 ? 'Order service is unavailable' : error.message }, requestId: request.id });
  });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'order', status: 'ok', rabbitmq: Boolean(broker) }; });
  app.get('/v1/menu', request => cartStore.listMenu(request.headers['x-restaurant-id']));
  app.get('/v1/sessions/:id/cart', request => cartStore.readCart(request.params.id));
  app.put('/v1/sessions/:id/cart/items/:menuItemId', request => cartStore.setQuantity({ ...request.body,
    sessionId: request.params.id, menuItemId: request.params.menuItemId, participantId: request.headers['x-participant-id'] }));
  app.delete('/v1/sessions/:id/cart/items/:menuItemId', request => cartStore.removeItem({ ...request.body,
    sessionId: request.params.id, menuItemId: request.params.menuItemId, participantId: request.headers['x-participant-id'] }));
  app.post('/v1/checkouts', request => checkoutStore.createCheckout(request.body ?? {}));
  app.get('/v1/checkouts/:id', request => checkoutStore.getCheckout(request.params.id));
  app.post('/v1/checkouts/:id/retry', request => checkoutStore.retryCheckout({ ...request.body, id: request.params.id }));
  return app;
}
async function connectBroker() {
  connection = await amqp.connect(rabbitUrl);
  broker = await connection.createConfirmChannel();
  broker.on('error', () => {});
  broker.on('close', () => { broker = undefined; });
  const channel = broker;
  connection.on('error', () => {});
  connection.on('close', () => { broker = undefined; });
  await channel.assertExchange('tablesync.events', 'topic', { durable: true });
  await channel.assertExchange('tablesync.dead', 'topic', { durable: true });
  await channel.assertQueue('tablesync.order.payment.v2.dead', { durable: true });
  await channel.bindQueue('tablesync.order.payment.v2.dead', 'tablesync.dead', 'payment.saga_committed.v2');
  await channel.assertQueue('tablesync.order.payment.v2', { durable: true,
    deadLetterExchange: 'tablesync.dead', deadLetterRoutingKey: 'payment.saga_committed.v2' });
  await channel.bindQueue('tablesync.order.payment.v2', 'tablesync.events', 'payment.saga_committed.v2');
  await channel.prefetch(1);
  await channel.consume('tablesync.order.payment.v2', message => processPaymentDelivery(message, { channel, project: checkoutStore.projectCommittedPayment }));
}
async function start() {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET is required');
  await database.query('SELECT 1'); await connectBroker();
  const app = buildApp();
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; running = true;
    try { if (!broker) await connectBroker(); await checkoutStore.reconcilePending(); await outbox.flushOutbox(); }
    catch (error) { app.log.error({ err: error }, 'order delivery pending'); }
    finally { running = false; }
  }, 5000);
  await app.listen({ port: Number(process.env.PORT ?? 8082), host: '0.0.0.0' });
  let stopping = false;
  async function stop() {
    if (stopping) return; stopping = true;
    clearInterval(timer); await app.close(); await connection?.close(); await database.end();
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
