import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createAuth } from '../src/auth.js';
import { buildApp } from '../server.js';

const issuer = 'https://identity.tablesync.test/auth/v1';
const audience = 'authenticated';
const subject = randomUUID();
const restaurantId = '00000000-0000-4000-8000-000000000001';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const guestSecret = 'synthetic-test-guest-secret-at-least-32-bytes';
function fixture(assignments = { [subject]: { restaurantId, roles: ['staff'] } }) {
  return createAuth({ issuer, audience, jwks: createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'test' }] }), staffAssignments: assignments, guestSecret });
}
function staffToken(claims = {}, key = privateKey) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(subject)
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('1h').sign(key);
}

test('staff tokens require signature, issuer, audience, expiry, and membership', async () => {
  const auth = fixture();
  const token = await staffToken();
  assert.equal((await auth.verifyStaff(token)).restaurantId, restaurantId);
  const other = await generateKeyPair('RS256');
  await assert.rejects(auth.verifyStaff(await staffToken({}, other.privateKey)), { statusCode: 401 });
  for (const claims of [{ iss: 'https://other.test' }, { aud: 'wrong' }, { exp: 1 }]) {
    const invalid = await new SignJWT({ sub: subject, iss: issuer, aud: audience, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
    await assert.rejects(auth.verifyStaff(invalid), { statusCode: 401 });
  }
  await assert.rejects(fixture({}).verifyStaff(token), { statusCode: 403 });
  await assert.rejects(auth.verifyStaff(token, { role: 'operator' }), { statusCode: 403 });
});

test('guest credentials bind a server participant to one session', async () => {
  const auth = fixture();
  const input = { participantId: randomUUID(), sessionId: randomUUID() };
  const token = await auth.issueGuest(input);
  assert.deepEqual(await auth.verifyGuest(token, { sessionId: input.sessionId }), input);
  await assert.rejects(auth.verifyGuest(token, { sessionId: randomUUID() }), { statusCode: 403 });
  await assert.rejects(auth.verifyStaff(token), { statusCode: 401 });
});

test('gateway enforces body/rate bounds and discards forged internal identity', async t => {
  const auth = fixture();
  const calls = [];
  const participant = { id: randomUUID(), name: 'Maya' };
  const table = { code: 'SAGE-12', name: 'Table 12', restaurantId, session: { id: randomUUID(), status: 'OPEN', openedAt: new Date().toISOString(), participants: [participant] } };
  const app = buildApp({ runtime: 'services', auth, internalSecret: 'internal-test-secret', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ table, participant, replayed: false }), { status: 201, headers: { 'content-type': 'application/json' } });
  } });
  t.after(() => app.close());
  const join = { tableCode: 'SAGE-12', name: 'Maya', joinKey: randomUUID() };
  const response = await app.inject({ method: 'POST', url: '/v1/table-sessions/join', payload: join,
    headers: { authorization: 'Bearer caller-secret', 'x-participant-id': 'spoof', 'x-session-id': 'spoof', 'x-restaurant-id': 'spoof' } });
  assert.equal(response.statusCode, 201);
  assert.equal(new Headers(calls[0].options.headers).get('authorization'), 'Bearer internal-test-secret');
  for (const header of ['x-participant-id', 'x-session-id', 'x-restaurant-id']) assert.equal(new Headers(calls[0].options.headers).get(header), null);
  assert.equal((await auth.verifyGuest(response.json().guestToken)).participantId, participant.id);
  const oversized = await app.inject({ method: 'POST', url: '/v1/table-sessions/join', payload: { ...join, name: 'x'.repeat(17000) } });
  assert.equal(oversized.statusCode, 413);
  const staff = await staffToken();
  assert.equal((await app.inject({ url: '/v1/ops/overview', headers: { authorization: `Bearer ${staff}` } })).statusCode, 403);
  assert.equal((await app.inject({ url: '/v1/restaurant/tables' })).statusCode, 401);
  for (let i = 0; i < 29; i++) await app.inject({ method: 'POST', url: '/v1/table-sessions/join', payload: join });
  assert.equal((await app.inject({ method: 'POST', url: '/v1/table-sessions/join', payload: join })).statusCode, 429);
});
