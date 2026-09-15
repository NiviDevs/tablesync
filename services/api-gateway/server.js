import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const runtime = process.env.TABLESYNC_RUNTIME ?? 'local-demo';
const sessionUrl = process.env.SESSION_SERVICE_URL ?? 'http://localhost:8081';
const orderUrl = process.env.ORDER_SERVICE_URL ?? 'http://localhost:8082';
const paymentUrl = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:8083';
const menu = [
  { id: 'dumplings', name: 'Crispy corn dumplings', description: 'Sesame, scallion, chilli crisp', price: 260, emoji: '🥟' },
  { id: 'paneer', name: 'Smoked butter paneer', description: 'Charred tomato, fenugreek, naan', price: 340, emoji: '🍛' },
  { id: 'noodles', name: 'Chilli garlic noodles', description: 'Wok-tossed vegetables', price: 280, emoji: '🍜' },
  { id: 'milk-cake', name: 'Saffron milk cake', description: 'Pistachio, rose cream', price: 190, emoji: '🍮' }
];
const demoSessions = new Map();
const requestJson = async (url, options) => { const response = await fetch(url, options); if (!response.ok) throw new Error(`${response.status} from ${url}`); return response.json(); };
function localSession(code) { const tableCode = code.trim().toUpperCase(); if (!demoSessions.has(tableCode)) demoSessions.set(tableCode, { id: `session_${tableCode}`, tableCode, restaurant: 'Juniper House', tableName: 'Table 12', participants: [], items: [] }); return demoSessions.get(tableCode); }
function present(session, cart) { const items = cart?.items ?? session.items ?? []; return { ...session, menu, items, subtotal: cart?.subtotal ?? items.reduce((total, item) => total + item.price * item.quantity, 0), collaborative: session.participants.length > 1, runtime }; }
async function getSession(code) { if (runtime === 'services') { const session = await requestJson(`${sessionUrl}/v1/sessions/${code}`); const cart = await requestJson(`${orderUrl}/v1/carts/${session.id}`); return present(session, cart); } return present(localSession(code)); }
async function joinSession(tableCode, participant) { if (runtime === 'services') { await requestJson(`${sessionUrl}/v1/sessions/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tableCode, participant }) }); return getSession(tableCode); } const session = localSession(tableCode); const existing = session.participants.find(entry => entry.id === participant.id); if (existing) existing.name = participant.name; else session.participants.push({ ...participant, joinedAt: new Date().toISOString() }); return present(session); }
async function addItem(code, participantId, menuItemId) { if (runtime === 'services') { const session = await requestJson(`${sessionUrl}/v1/sessions/${code}`); await requestJson(`${orderUrl}/v1/carts/${session.id}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantId, menuItemId }) }); return getSession(code); } const session = localSession(code); if (!session.participants.some(entry => entry.id === participantId)) throw new Error('participant must join before adding items'); const item = menu.find(entry => entry.id === menuItemId); if (!item) throw new Error('menu item not found'); const existing = session.items.find(entry => entry.ownerId === participantId && entry.menuItemId === menuItemId); if (existing) existing.quantity += 1; else session.items.push({ id: randomUUID(), menuItemId, ownerId: participantId, name: item.name, price: item.price, emoji: item.emoji, quantity: 1 }); return present(session); }
async function checkout(code, outcomes, idempotencyKey) {
  if (runtime !== 'services') throw new Error('simulated checkout requires the Compose payment service');
  const session = await getSession(code);
  const payments = session.participants.map(participant => ({ participantId: participant.id, amount: session.items.filter(item => item.ownerId === participant.id).reduce((total, item) => total + item.price * item.quantity, 0), outcome: outcomes?.[participant.id] ?? 'success' })).filter(payment => payment.amount > 0);
  if (!payments.length) throw new Error('add an item before simulated checkout');
  const payment = await requestJson(`${paymentUrl}/v1/payment-sagas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, idempotencyKey, payments }) });
  return { session, payment };
}
async function ordersFor(code) {
  if (runtime !== 'services') throw new Error('consolidated orders require the Compose Order service');
  const session = await getSession(code);
  return requestJson(`${orderUrl}/v1/orders?sessionId=${encodeURIComponent(session.id)}`);
}

export function buildApp() {
  const app = Fastify({ logger: true }); const rooms = new Map(); app.register(websocket);
  app.addHook('onRequest', async (_request, reply) => { reply.header('access-control-allow-origin', process.env.WEB_ORIGIN ?? 'http://localhost:3000'); reply.header('access-control-allow-methods', 'GET,POST,OPTIONS'); reply.header('access-control-allow-headers', 'content-type'); });
  app.options('*', async (_request, reply) => reply.code(204).send());
  const broadcast = async (code, type) => { const message = JSON.stringify({ type, session: await getSession(code) }); for (const socket of rooms.get(code.toUpperCase()) ?? []) if (socket.readyState === socket.OPEN) socket.send(message); };
  app.get('/health', async () => ({ service: 'api-gateway', status: 'ok', runtime }));
  app.get('/metrics', async (_request, reply) => reply.type('text/plain').send(`# HELP tablesync_active_table_sessions Active gateway rooms\n# TYPE tablesync_active_table_sessions gauge\ntablesync_active_table_sessions ${rooms.size}\n`));
  app.get('/v1/table-sessions/:code', async request => getSession(request.params.code));
  app.post('/v1/table-sessions/join', async (request, reply) => { const { tableCode, participant } = request.body ?? {}; if (!tableCode || !participant?.id || !participant?.name) return reply.code(400).send({ error: 'tableCode and participant id/name are required' }); try { const session = await joinSession(tableCode, participant); await broadcast(tableCode, 'participant.joined.v1'); return session; } catch (error) { return reply.code(502).send({ error: 'session service unavailable', detail: error.message }); } });
  app.post('/v1/table-sessions/:code/cart-items', async (request, reply) => { const { participantId, menuItemId } = request.body ?? {}; try { const session = await addItem(request.params.code, participantId, menuItemId); await broadcast(request.params.code, 'cart.item_added.v1'); return session; } catch (error) { const status = error.message.includes('must join') || error.message.includes('403') ? 403 : error.message.includes('not found') || error.message.includes('404') ? 404 : 502; return reply.code(status).send({ error: error.message }); } });
  app.post('/v1/table-sessions/:code/checkout', async (request, reply) => { const { outcomes, idempotencyKey } = request.body ?? {}; if (!idempotencyKey) return reply.code(400).send({ error: 'idempotencyKey is required' }); try { return await checkout(request.params.code, outcomes, idempotencyKey); } catch (error) { return reply.code(error.message.includes('add an item') ? 400 : 502).send({ error: error.message }); } });
  app.get('/v1/table-sessions/:code/orders', async (request, reply) => { try { return await ordersFor(request.params.code); } catch (error) { return reply.code(502).send({ error: error.message }); } });
  app.get('/v1/table-sessions/:code/live', { websocket: true }, async (socket, request) => { const code = request.params.code.toUpperCase(); if (!rooms.has(code)) rooms.set(code, new Set()); rooms.get(code).add(socket); try { socket.send(JSON.stringify({ type: 'session.snapshot.v1', session: await getSession(code) })); } catch { socket.send(JSON.stringify({ type: 'session.error.v1', error: 'Session service unavailable' })); } socket.on('close', () => rooms.get(code)?.delete(socket)); });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const app = buildApp(); app.listen({ port: Number(process.env.PORT ?? 8080), host: '0.0.0.0' }); }
