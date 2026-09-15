import Fastify from 'fastify';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { runSplitPaymentSaga } from './src/saga.js';

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://tablesync:tablesync@localhost:5432/tablesync' });
let broker;
const validOutcomes = new Set(['success', 'failure', 'timeout']);
const envelope = (type, data) => ({ id: randomUUID(), version: 1, occurredAt: new Date().toISOString(), correlationId: randomUUID(), type, data });
async function publish(type, data) { if (broker) broker.publish('tablesync.events', type, Buffer.from(JSON.stringify(envelope(type, data))), { persistent: true }); }
const feeFor = amount => Math.ceil(amount / 100);

async function sagaView(sagaId) {
  const saga = await database.query('SELECT id, session_id AS "sessionId", status, total_amount AS "totalAmount", platform_fee AS "platformFee", created_at AS "createdAt", completed_at AS "completedAt" FROM saga_state WHERE id=$1', [sagaId]);
  if (!saga.rowCount) return null;
  const intents = await database.query('SELECT id AS "intentId", participant_id AS "participantId", amount, outcome, status FROM payment_intents WHERE saga_id=$1 ORDER BY created_at', [sagaId]);
  return { ...saga.rows[0], simulated: true, intents: intents.rows };
}

async function persistSaga({ sessionId, idempotencyKey, payments }) {
  const existing = await database.query('SELECT id FROM saga_state WHERE idempotency_key=$1', [idempotencyKey]);
  if (existing.rowCount) return { replayed: true, saga: await sagaView(existing.rows[0].id), events: [] };
  const saga = await runSplitPaymentSaga({ sagaId: randomUUID(), payments });
  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const platformFee = feeFor(totalAmount);
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO saga_state (id,idempotency_key,session_id,status,total_amount,platform_fee,completed_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [saga.sagaId, idempotencyKey, sessionId, saga.status, totalAmount, platformFee]);
    for (const attempt of saga.attempts) {
      const compensation = saga.compensations.find(entry => entry.intentId === attempt.intentId);
      const outcome = attempt.states.at(-1) === 'SUCCEEDED' ? 'success' : attempt.states.at(-1) === 'TIMED_OUT' ? 'timeout' : 'failure';
      const status = compensation ? 'REFUNDED' : attempt.states.at(-1);
      await client.query('INSERT INTO payment_intents (id,saga_id,participant_id,amount,outcome,status) VALUES ($1,$2,$3,$4,$5,$6)', [attempt.intentId, saga.sagaId, attempt.participantId, attempt.amount, outcome, status]);
      await client.query('INSERT INTO payment_attempts (intent_id,provider,state_history) VALUES ($1,$2,$3)', [attempt.intentId, 'mock', JSON.stringify(attempt.states)]);
    }
    await client.query('INSERT INTO platform_fee_ledger (saga_id,amount,status) VALUES ($1,$2,$3)', [saga.sagaId, platformFee, saga.status === 'COMMITTED' ? 'RECORDED' : 'VOIDED']);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return { replayed: false, saga: await sagaView(saga.sagaId), events: saga.events };
}

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/health', async () => { await database.query('SELECT 1'); return { service: 'payment', status: 'ok', provider: 'mock', simulated: true, rabbitmq: Boolean(broker) }; });
  app.get('/v1/payment-sagas/:id', async (request, reply) => { const saga = await sagaView(request.params.id); return saga ?? reply.code(404).send({ error: 'payment saga not found' }); });
  app.post('/v1/payment-sagas', async (request, reply) => {
    const { sessionId, idempotencyKey, payments } = request.body ?? {};
    if (!sessionId || !idempotencyKey || !Array.isArray(payments) || !payments.length || payments.some(payment => !payment?.participantId || !Number.isInteger(payment.amount) || payment.amount <= 0 || !validOutcomes.has(payment.outcome))) return reply.code(400).send({ error: 'sessionId, idempotencyKey, and non-empty deterministic payments are required' });
    try {
      const result = await persistSaga({ sessionId, idempotencyKey, payments });
      for (const event of result.events) await publish(event.type, { ...event.data, sessionId });
      return reply.code(result.replayed ? 200 : 201).send(result.saga);
    } catch (error) { request.log.error(error); return reply.code(500).send({ error: 'could not persist simulated payment saga' }); }
  });
  return app;
}

async function start() {
  await database.query('SELECT 1');
  const connection = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
  broker = await connection.createChannel();
  await broker.assertExchange('tablesync.events', 'topic', { durable: true });
  await broker.assertQueue('tablesync.audit', { durable: true });
  await broker.bindQueue('tablesync.audit', 'tablesync.events', '#');
  await buildApp().listen({ port: Number(process.env.PORT ?? 8083), host: '0.0.0.0' });
}
if (process.argv[1]?.endsWith('server.js')) start();
