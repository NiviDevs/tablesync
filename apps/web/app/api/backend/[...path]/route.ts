import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

const routes: [string, RegExp][] = [
  ['GET', /^v1\/tables\/[A-Z0-9-]+$/], ['GET', /^v1\/menu$/],
  ['POST', /^v1\/table-sessions\/join$/],
  ['GET', /^v1\/sessions\/[a-f0-9-]+\/cart$/],
  ['PUT|DELETE', /^v1\/sessions\/[a-f0-9-]+\/cart\/items\/[a-zA-Z0-9_-]+$/],
  ['POST', /^v1\/sessions\/[a-f0-9-]+\/checkouts$/],
  ['GET', /^v1\/checkouts\/[a-f0-9-]+$/], ['POST', /^v1\/checkouts\/[a-f0-9-]+\/retry$/],
  ['GET', /^v1\/restaurant\/(tables|orders|menu|analytics)$/], ['PATCH', /^v1\/orders\/[a-f0-9-]+\/status$/],
  ['POST', /^v1\/restaurant\/menu$/], ['PUT', /^v1\/restaurant\/menu\/[a-zA-Z0-9_-]+$/],
  ['POST', /^v1\/restaurant\/tables$/], ['DELETE', /^v1\/restaurant\/tables\/[A-Z0-9-]+$/],
  ['POST', /^v1\/sessions\/[a-f0-9-]+\/close$/],
];
const failure = (status: number, code: string, message: string) => Response.json(
  { error: { code, message }, requestId: crypto.randomUUID() }, { status, headers: { 'cache-control': 'no-store' } });

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join('/');
  if (!routes.some(([methods, pattern]) => methods.split('|').includes(request.method) && pattern.test(path))) {
    return failure(404, 'NOT_FOUND', 'Route not found');
  }
  const url = new URL(request.url);
  const staff = path.startsWith('v1/restaurant/') || path.endsWith('/status') || path.endsWith('/close');
  // Next's internal request URL can use its bind hostname; Host is the browser-facing authority.
  const publicOrigin = `${url.protocol}//${request.headers.get('host')}`;
  if (staff && request.method !== 'GET' && request.headers.get('origin') !== publicOrigin) {
    return failure(403, 'ORIGIN_REJECTED', 'Staff changes must come from this site');
  }
  let authorization = request.headers.get('authorization');
  if (staff && !authorization && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const { data } = await createClient(await cookies()).auth.getSession();
    if (data.session) authorization = `Bearer ${data.session.access_token}`;
  }
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  let body: Uint8Array | undefined;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return failure(413, 'BODY_TOO_LARGE', 'Request exceeds 16 KiB'); }
      chunks.push(value);
    }
    if (size) {
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      headers['content-type'] = 'application/json';
    }
  }
  const upstream = new URL(`/${path}`, process.env.GATEWAY_URL || 'http://localhost:8080');
  if (path === 'v1/menu') upstream.searchParams.set('tableCode', url.searchParams.get('tableCode') ?? '');
  if (path === 'v1/restaurant/analytics') for (const key of ['days', 'date']) {
    const value = url.searchParams.get(key);
    if (value !== null) upstream.searchParams.set(key, value);
  }
  try {
    const response = await fetch(upstream, { method: request.method, headers, body, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(5000) });
    return new Response(await response.text(), { status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch { return failure(503, 'DEPENDENCY_UNAVAILABLE', 'A required service is unavailable. Please retry.'); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
