// Private identity issuer for the explicitly enabled local educational demo.
import { createServer } from 'node:http';
import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { SignJWT, importJWK } from 'jose';

if (process.env.TABLESYNC_DEMO_ENABLED !== 'true') throw new Error('Demo identity is disabled');
const secret = process.env.INTERNAL_API_SECRET;
if (!secret) throw new Error('INTERNAL_API_SECRET is required');
const privateJwk = JSON.parse(process.env.DEMO_JWT_PRIVATE_JWK);
const publicJwk = createPublicKey(createPrivateKey({ key: privateJwk, format: 'jwk' })).export({ format: 'jwk' });
const kid = 'tablesync-demo';
const signingKey = await importJWK(privateJwk, 'RS256');
const issuer = process.env.STAFF_JWT_ISSUER || 'http://demo-identity:8084';
const authorized = value => {
  const supplied = Buffer.from(value || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  response.setHeader('cache-control', 'no-store');
  if (request.method === 'GET' && request.url === '/jwks') return response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: 'RS256', kid, use: 'sig' }] }));
  if (request.method === 'GET' && request.url === '/health') return response.end('{"status":"ok"}');
  if (request.method !== 'POST' || !['/session/owner', '/session/operator'].includes(request.url)) {
    response.writeHead(404); return response.end('{}');
  }
  if (!authorized(request.headers.authorization)) { response.writeHead(401); return response.end('{}'); }
  try {
    const role = request.url.endsWith('/operator') ? 'operator' : 'owner';
    const accessToken = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(`tablesync-demo-${role}`).setIssuer(issuer).setAudience('authenticated')
      .setIssuedAt().setExpirationTime('8h').sign(signingKey);
    response.end(JSON.stringify({ accessToken }));
  } catch { response.writeHead(503); response.end('{"error":"Demo sign-in unavailable"}'); }
}).listen(Number(process.env.PORT || 8084), '0.0.0.0');
