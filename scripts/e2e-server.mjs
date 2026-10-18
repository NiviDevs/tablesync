// Isolated local browser fixture. Never imported by application code.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { testDatabase } from './test-database.mjs';
import { createClient } from 'redis';

const root = fileURLToPath(new URL('../', import.meta.url));
const statePath = process.env.E2E_STATE_PATH;
if (!statePath) throw new Error('Run via npm run test:e2e');
const cleanups = [];
const children = new Set();
const log = [];
const guestSecret = randomBytes(32).toString('hex');
const controlToken = randomBytes(32).toString('hex');
const origin = 'http://127.0.0.1:3100';
const issuer = 'http://127.0.0.1:18090';
const restaurantId = '00000000-0000-4000-8000-000000000001';
const subject = randomUUID();
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'local-e2e', alg: 'RS256' };
const staffToken = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
  .setSubject(subject).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);
let env;
let order;
let payment;
function start(file, port) {
  const child = spawn(process.execPath, [file], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    log.push(data.toString()); if (log.length > 100) log.shift();
  });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
  children.delete(child);
}
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Fixture startup timed out: ${url}`);
}
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/jwks' && request.method === 'GET') return response.end(JSON.stringify({ keys: [jwk] }));
  if (request.headers.authorization !== `Bearer ${controlToken}` || request.method !== 'POST') { response.writeHead(403); return response.end('{}'); }
  try {
    if (request.url === '/restart-order') { await stop(order); order = start('services/order/server.js', 18082); await waitFor('http://127.0.0.1:18082/health'); }
    else if (request.url === '/stop-payment') await stop(payment);
    else if (request.url === '/start-payment') { await stop(payment); payment = start('services/payment/server.js', 18083); await waitFor('http://127.0.0.1:18083/health'); }
    else { response.writeHead(404); return response.end('{}'); }
    response.end('{}');
  } catch { response.writeHead(500); response.end('{"error":"Fixture control failed"}'); }
});
let shuttingDown = false;
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...children].map(stop));
  server.close();
  for (const callback of cleanups.reverse()) await callback();
  await rm(statePath, { force: true });
}
process.once('SIGTERM', () => cleanup().then(() => process.exit()));
process.once('SIGINT', () => cleanup().then(() => process.exit()));
try {
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) throw new Error('Browser fixture requires local disposable PostgreSQL');
  const database = await testDatabase({ after: callback => cleanups.push(callback) });
  cleanups.push(async () => {
    const redis = createClient({ url: 'redis://127.0.0.1:6379/15' });
    await redis.connect();
    try {
      const sessions = await database.pool.query('SELECT id FROM table_sessions');
      for (const { id } of sessions.rows) await redis.del(`session:${id}:presence`);
    } finally { await redis.quit(); }
  });
  const vhost = `tablesync_test_${randomUUID().replaceAll('-', '')}`;
  const management = 'http://127.0.0.1:15672/api';
  const managementHeaders = { authorization: `Basic ${Buffer.from('guest:guest').toString('base64')}`, 'content-type': 'application/json' };
  async function broker(path, method, body) {
    const response = await fetch(`${management}${path}`, { method, headers: managementHeaders, body: body && JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Test RabbitMQ setup failed (${response.status})`);
  }
  await broker(`/vhosts/${vhost}`, 'PUT', {});
  cleanups.push(() => broker(`/vhosts/${vhost}`, 'DELETE'));
  await broker(`/permissions/${vhost}/guest`, 'PUT', { configure: '.*', write: '.*', read: '.*' });
  env = { ...process.env, DATABASE_URL: database.connectionString,
    INTERNAL_API_SECRET: randomBytes(32).toString('hex'), GUEST_TOKEN_SECRET: guestSecret,
    TABLESYNC_RUNTIME: 'services', RABBITMQ_URL: `amqp://guest:guest@127.0.0.1:5672/${vhost}`,
    REDIS_URL: 'redis://127.0.0.1:6379/15', SESSION_SERVICE_URL: 'http://127.0.0.1:18081',
    ORDER_SERVICE_URL: 'http://127.0.0.1:18082', PAYMENT_SERVICE_URL: 'http://127.0.0.1:18083',
    STAFF_JWT_ISSUER: issuer, STAFF_JWKS_URL: `${issuer}/jwks`, STAFF_JWT_AUDIENCE: 'authenticated',
    STAFF_ASSIGNMENTS_JSON: JSON.stringify({ [subject]: { restaurantId, roles: ['staff'] } }),
    GATEWAY_URL: 'http://127.0.0.1:18080', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  };
  server.listen(18090, '127.0.0.1'); await once(server, 'listening');
  start('services/session/server.js', 18081);
  payment = start('services/payment/server.js', 18083);
  order = start('services/order/server.js', 18082);
  start('services/api-gateway/server.js', 18080);
  await Promise.all([18080, 18081, 18082, 18083].map(port => waitFor(`http://127.0.0.1:${port}/health`)));
  await writeFile(statePath, JSON.stringify({ staffToken, guestSecret, controlToken, origin,
    databaseUrl: database.connectionString, gateway: env.GATEWAY_URL, issuer }), { mode: 0o600 });
  const web = spawn(process.execPath, [fileURLToPath(import.meta.resolve('next/dist/bin/next')), 'start', '--hostname', '127.0.0.1', '--port', '3100'],
    { cwd: `${root}/apps/web`, env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(web);
  for (const stream of [web.stdout, web.stderr]) stream.on('data', data => { log.push(data.toString()); if (log.length > 100) log.shift(); });
  await waitFor(`${origin}/app`);
  console.log('Isolated browser fixture ready (local signing key, disposable schema and RabbitMQ vhost).');
} catch (error) {
  // Logs can contain synthetic authorization headers; never print them.
  console.error(error.message);
  await cleanup();
  process.exit(1);
}
