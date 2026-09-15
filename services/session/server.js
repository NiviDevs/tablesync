import Fastify from 'fastify';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createClient } from 'redis';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
let broker;
const rabbitUrl = process.env.RABBITMQ_URL ?? `amqp://${encodeURIComponent(process.env.RABBITMQ_DEFAULT_USER ?? 'guest')}:${encodeURIComponent(process.env.RABBITMQ_DEFAULT_PASS ?? 'guest')}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;
const envelope = (type, data) => ({ id: randomUUID(), version: 1, occurredAt: new Date().toISOString(), correlationId: randomUUID(), type, data });
async function publish(type, data) { if (broker) broker.publish('tablesync.events', type, Buffer.from(JSON.stringify(envelope(type, data))), { persistent: true }); }
async function sessionFor(code) {
  const result = await database.query('SELECT id, table_code AS "tableCode", restaurant_name AS restaurant, table_name AS "tableName" FROM table_sessions WHERE table_code=$1', [code.toUpperCase()]);
  if (result.rowCount) return result.rows[0];
  const session = { id: randomUUID(), tableCode: code.toUpperCase(), restaurant: 'Juniper House', tableName: 'Table 12' };
  await database.query('INSERT INTO table_sessions (id,table_code,restaurant_name,table_name) VALUES ($1,$2,$3,$4)', [session.id, session.tableCode, session.restaurant, session.tableName]);
  return session;
}
export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'session', status: 'ok', redis: redis.isReady, rabbitmq: Boolean(broker) }; });
  app.get('/v1/sessions/:code', async request => { const session = await sessionFor(request.params.code); const participants = await database.query('SELECT id,display_name AS name,joined_at AS "joinedAt" FROM participants WHERE session_id=$1 ORDER BY joined_at', [session.id]); return { ...session, participants: participants.rows }; });
  app.get('/v1/sessions/id/:id', async (request, reply) => { const result = await database.query('SELECT id, table_code AS "tableCode", restaurant_name AS restaurant, table_name AS "tableName" FROM table_sessions WHERE id=$1', [request.params.id]); if (!result.rowCount) return reply.code(404).send({ error: 'session not found' }); const participants = await database.query('SELECT id,display_name AS name,joined_at AS "joinedAt" FROM participants WHERE session_id=$1 ORDER BY joined_at', [request.params.id]); return { ...result.rows[0], participants: participants.rows }; });
  app.post('/v1/sessions/join', async (request, reply) => { const { tableCode, participant } = request.body ?? {}; if (!tableCode || !participant?.id || !participant?.name) return reply.code(400).send({ error: 'tableCode and participant id/name are required' }); const session = await sessionFor(tableCode); await database.query('INSERT INTO participants (id,session_id,display_name) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name', [participant.id, session.id, participant.name]); if (redis.isReady) await redis.sAdd(`session:${session.id}:presence`, participant.id); await publish('participant.joined.v1', { sessionId: session.id, participant: { id: participant.id, name: participant.name } }); const participants = await database.query('SELECT id,display_name AS name,joined_at AS "joinedAt" FROM participants WHERE session_id=$1 ORDER BY joined_at', [session.id]); return { ...session, participants: participants.rows }; });
  return app;
}
async function start() { await database.query('SELECT 1'); await redis.connect(); const connection = await amqp.connect(rabbitUrl); const channel = await connection.createChannel(); await channel.assertExchange('tablesync.events', 'topic', { durable: true }); await channel.assertQueue('tablesync.audit', { durable: true }); await channel.bindQueue('tablesync.audit', 'tablesync.events', '#'); broker = channel; const app = buildApp(); await app.listen({ port: Number(process.env.PORT ?? 8081), host: '0.0.0.0' }); }
if (process.argv[1]?.endsWith('server.js')) start();
