import { registerTelemetry, registerHealth, fastifyOptions, registerShutdown, trackBroker } from '@tablesync/telemetry';
import Fastify from 'fastify';
import amqp from 'amqplib';
import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { createPaymentStore } from './src/persistence.js';
import { createOutbox } from './src/outbox.js';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const store = createPaymentStore({ pool: database });
const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
let connection;
let broker;
let brokerReady = () => false;
const outbox = createOutbox({ pool: database, getChannel: () => broker });

export function buildApp({ internalSecret = process.env.INTERNAL_API_SECRET, paymentStore = store,
  checkDependencies = async () => { await database.query({ text: 'SELECT 1', query_timeout: 900 }); return brokerReady(); } } = {}) {
  const app = Fastify(fastifyOptions);
  registerTelemetry(app, { service: 'payment' });
  registerHealth(app, { checkDependencies });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/v1/') && (!internalSecret || request.headers.authorization !== `Bearer ${internalSecret}`)) {
      return reply.code(internalSecret ? 401 : 503).send({ error: { code: 'INTERNAL_AUTH_REQUIRED', message: 'Private service credential required' }, requestId: request.id });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503;
    if (status >= 500) request.log.error({ err: error }, 'payment request failed');
    reply.code(status).send({ error: { code: error.code ?? 'PAYMENT_UNAVAILABLE', message: status >= 500 ? 'Payment service is unavailable' : error.message }, requestId: request.id });
  });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'payment', status: 'ok', simulated: true, provider: 'mock', rabbitmq: Boolean(broker) }; });
  app.get('/v1/payment-sagas/by-checkout/:id', async (request, reply) =>
    (await paymentStore.getByCheckout(request.params.id)) ?? reply.code(404).send({ error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }, requestId: request.id }));
  app.post('/v1/payment-sagas', async (request, reply) => {
    const result = await paymentStore.persistSaga(request.body ?? {});
    return reply.code(result.replayed ? 200 : 201).send(result.saga);
  });
  return app;
}
async function connectBroker() {
  connection = await amqp.connect(rabbitUrl);
  broker = await connection.createConfirmChannel();
  brokerReady = trackBroker(connection, broker);
  broker.on('error', () => {});
  broker.on('close', () => { broker = undefined; });
  connection.on('error', () => {});
  connection.on('close', () => { broker = undefined; });
  await broker.assertExchange('tablesync.events', 'topic', { durable: true });
  await broker.assertQueue('tablesync.audit', { durable: true });
  await broker.bindQueue('tablesync.audit', 'tablesync.events', '#');
}
async function start() {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET is required');
  await database.query('SELECT 1');
  await connectBroker();
  const app = buildApp();
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { if (!broker) await connectBroker(); await outbox.flushOutbox(); }
    catch (error) { app.log.error({ err: error }, 'payment delivery pending'); }
    finally { running = false; }
  }, 5000);
  await app.listen({ port: Number(process.env.PORT ?? 8083), host: '0.0.0.0' });
  registerShutdown(app, async () => {
    clearInterval(timer); await Promise.allSettled([connection?.close(), database.end()]);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
