import { createHash } from 'node:crypto';
import { bearer } from './auth.js';

const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };

export function registerProductRoutes(app, { auth, internalSecret, sessionUrl, fetchImpl = fetch }) {
  if (!internalSecret) throw new Error('INTERNAL_API_SECRET is required in services runtime');
  const limits = new Map();
  function limit(key, maximum) {
    const now = Date.now();
    if (limits.size > 1000) for (const [entry, value] of limits) if (value.until <= now) limits.delete(entry);
    let window = limits.get(key);
    if (!window || window.until <= now) {
      if (!window && limits.size >= 10000) fail(429, 'RATE_LIMITED', 'Rate-limit capacity reached; retry shortly');
      window = { count: 0, until: now + 60000 }; limits.set(key, window);
    }
    if (++window.count > maximum) fail(429, 'RATE_LIMITED', 'Too many requests; retry after one minute');
  }
  app.addHook('onRequest', async request => {
    const path = request.url.split('?')[0];
    if (path === '/v1/table-sessions/join' && request.method === 'POST') limit(`join:${request.ip}`, 30);
    else if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && path.startsWith('/v1/')) {
      const token = bearer(request);
      limit(`mutation:${createHash('sha256').update(token).digest('hex')}`, 120);
    }
    if (path.startsWith('/v1/ops/')) request.identity = await auth.verifyStaff(bearer(request), { role: 'operator' });
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 503;
    if (status >= 500) request.log.error({ err: error }, 'gateway request failed');
    reply.code(status).send({ error: { code: error.code ?? 'DEPENDENCY_UNAVAILABLE', message: status >= 500 ? 'A required service is unavailable' : error.message }, requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: request.id }));
  async function callSession(path, { method = 'GET', body, identity } = {}) {
    const headers = { authorization: `Bearer ${internalSecret}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (identity?.restaurantId) headers['x-restaurant-id'] = identity.restaurantId;
    if (identity?.participantId) headers['x-participant-id'] = identity.participantId;
    if (identity?.sessionId) headers['x-session-id'] = identity.sessionId;
    let response;
    try {
      response = await fetchImpl(new URL(path, sessionUrl), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    } catch { fail(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable'); }
    const data = await response.json();
    if (!response.ok) fail(response.status, data.error?.code ?? 'SESSION_UNAVAILABLE', data.error?.message ?? 'Session request failed');
    return data;
  }
  app.get('/v1/tables/:code', request => callSession(`/v1/tables/${encodeURIComponent(request.params.code)}`));
  app.post('/v1/table-sessions/join', async (request, reply) => {
    const body = request.body;
    if (!body || Object.keys(body).some(k => !['tableCode', 'name', 'joinKey'].includes(k))) fail(400, 'INVALID_JOIN', 'Only tableCode, name, and joinKey are accepted');
    const joined = await callSession('/v1/table-sessions/join', { method: 'POST', body });
    const guestToken = await auth.issueGuest({ participantId: joined.participant.id, sessionId: joined.table.session.id });
    return reply.code(joined.replayed ? 200 : 201).send({ table: joined.table, participant: joined.participant, guestToken });
  });
  app.get('/v1/restaurant/tables', async request => {
    const identity = await auth.verifyStaff(bearer(request));
    return callSession('/v1/restaurant/tables', { identity });
  });
  return { callSession, auth };
}
