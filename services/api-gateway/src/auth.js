import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
export function bearer(request) {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !/^Bearer \S+$/i.test(value)) fail(401, 'CREDENTIALS_REQUIRED', 'A bearer credential is required');
  return value.slice(7);
}

export function createAuth({ issuer, audience, jwks, staffAssignments = {}, guestSecret }) {
  if (typeof guestSecret !== 'string' || Buffer.byteLength(guestSecret) < 32) throw new Error('GUEST_TOKEN_SECRET must contain at least 32 bytes');
  const secret = new TextEncoder().encode(guestSecret);
  const resolver = typeof jwks === 'string' || jwks instanceof URL ? createRemoteJWKSet(new URL(jwks), { timeoutDuration: 3000 }) : jwks;
  const guestIssuer = 'tablesync:guest';
  const guestAudience = 'tablesync:table';
  async function verifyStaff(token, { role } = {}) {
    if (!issuer || !audience || !resolver) fail(503, 'IDENTITY_UNAVAILABLE', 'Staff identity is not configured');
    let payload;
    try {
      ({ payload } = await jwtVerify(token, resolver, { issuer, audience, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'] }));
    } catch (error) {
      if (error.code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError) fail(503, 'IDENTITY_UNAVAILABLE', 'Staff identity provider is unavailable');
      fail(401, 'INVALID_STAFF_TOKEN', 'Staff credential is invalid or expired');
    }
    const assignment = Object.hasOwn(staffAssignments, payload.sub) ? staffAssignments[payload.sub] : null;
    if (!assignment || !uuid.test(assignment.restaurantId) || !Array.isArray(assignment.roles) ||
      !assignment.roles.some(r => r === 'staff' || r === 'operator') || (role && !assignment.roles.includes(role))) {
      fail(403, 'STAFF_MEMBERSHIP_REQUIRED', 'This action requires an assigned restaurant role');
    }
    return { subject: payload.sub, restaurantId: assignment.restaurantId, roles: assignment.roles };
  }
  async function issueGuest({ participantId, sessionId }) {
    if (!uuid.test(participantId) || !uuid.test(sessionId)) fail(400, 'INVALID_GUEST_SCOPE', 'Server-issued participant/session IDs are required');
    return new SignJWT({ sessionId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(participantId).setIssuer(guestIssuer).setAudience(guestAudience)
      .setIssuedAt().setExpirationTime('8h').setJti(randomUUID()).sign(secret);
  }
  async function verifyGuest(token, { sessionId } = {}) {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, secret, { issuer: guestIssuer, audience: guestAudience, algorithms: ['HS256'],
        requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '8h' }));
    } catch { fail(401, 'INVALID_GUEST_TOKEN', 'Guest credential is invalid or expired'); }
    if (!uuid.test(payload.sub) || !uuid.test(payload.sessionId)) fail(401, 'INVALID_GUEST_TOKEN', 'Guest scope is invalid');
    if (sessionId && sessionId !== payload.sessionId) fail(403, 'GUEST_SCOPE_MISMATCH', 'Credential belongs to another seating');
    return { participantId: payload.sub, sessionId: payload.sessionId };
  }
  return { verifyStaff, issueGuest, verifyGuest };
}

export function authFromEnvironment() {
  const issuer = process.env.STAFF_JWT_ISSUER || undefined;
  return createAuth({ issuer, audience: process.env.STAFF_JWT_AUDIENCE || 'authenticated',
    jwks: process.env.STAFF_JWKS_URL || (issuer ? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json` : undefined),
    staffAssignments: JSON.parse(process.env.STAFF_ASSIGNMENTS_JSON || '{}'), guestSecret: process.env.GUEST_TOKEN_SECRET });
}
