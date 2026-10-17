import Fastify from 'fastify';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { createRegistry } from './src/registry.js';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
let broker;
const rabbitUrl = process.env.RABBITMQ_URL ?? `amqp://${encodeURIComponent(process.env.RABBITMQ_DEFAULT_USER ?? 'guest')}:${encodeURIComponent(process.env.RABBITMQ_DEFAULT_PASS ?? 'guest')}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;
async function publish(type, data) {
  if (broker) broker.publish('tablesync.events', type, Buffer.from(JSON.stringify({ id: randomUUID(), version: 1,
    occurredAt: new Date().toISOString(), correlationId: randomUUID(), type, data })), { persistent: true });
}

export function buildApp({ pool = database, registry = createRegistry({ pool }), internalSecret = process.env.INTERNAL_API_SECRET } = {}) {
  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/v1/') && (!internalSecret || request.headers.authorization !== `Bearer ${internalSecret}`)) {
      return reply.code(internalSecret ? 401 : 503).send({ error: { code: 'INTERNAL_AUTH_REQUIRED', message: 'Private service credential required' }, requestId: request.id });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503;
    if (status >= 500) request.log.error({ err: error }, 'session request failed');
    reply.code(status).send({ error: { code: error.code ?? 'SESSION_UNAVAILABLE', message: status >= 500 ? 'Session service is unavailable' : error.message }, requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: request.id }));
  app.get('/health', async () => { await pool.query('SELECT 1'); return { service: 'session', status: 'ok', redis: redis.isReady, rabbitmq: Boolean(broker) }; });
  app.get('/v1/tables/:code', request => registry.getTable(request.params.code));
  app.get('/v1/sessions/id/:id', request => registry.getSession(request.params.id));
  app.get('/v1/restaurant/tables', async request => ({ tables: await registry.listTables(request.headers['x-restaurant-id']) }));
  app.post('/v1/table-sessions/join', async (request, reply) => {
    const { tableCode, name, joinKey } = request.body ?? {};
    const result = await registry.joinTable({ code: tableCode, name, joinKey });
    if (!result.replayed) {
      if (redis.isReady) await redis.sAdd(`session:${result.table.session.id}:presence`, result.participant.id);
      await publish('participant.joined.v1', { sessionId: result.table.session.id, participant: result.participant });
    }
    return reply.code(result.replayed ? 200 : 201).send(result);
  });
  return app;
}
async function start() {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET is required');
  await database.query('SELECT 1');
  await redis.connect();
  const connection = await amqp.connect(rabbitUrl);
  broker = await connection.createChannel();
  await broker.assertExchange('tablesync.events', 'topic', { durable: true });
  await broker.assertQueue('tablesync.audit', { durable: true });
  await broker.bindQueue('tablesync.audit', 'tablesync.events', '#');
  await buildApp().listen({ port: Number(process.env.PORT ?? 8081), host: '0.0.0.0' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
