import { cookies } from 'next/headers';

export function GET() {
  return Response.json({ enabled: process.env.TABLESYNC_DEMO_ENABLED === 'true' }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(request: Request) {
  if (process.env.TABLESYNC_DEMO_ENABLED !== 'true' || !process.env.TABLESYNC_DEMO_IDENTITY_URL) {
    return Response.json({ error: 'Demo sign-in is disabled' }, { status: 404 });
  }
  const url = new URL(request.url);
  if (request.headers.get('origin') !== `${url.protocol}//${request.headers.get('host')}`) {
    return Response.json({ error: 'Sign in from this site' }, { status: 403 });
  }
  const body = await request.text();
  if (body.length > 128) return Response.json({ error: 'Invalid demo role' }, { status: 400 });
  let role;
  try { role = JSON.parse(body).role; } catch { return Response.json({ error: 'Invalid demo role' }, { status: 400 }); }
  if (!['owner', 'operator'].includes(role)) return Response.json({ error: 'Invalid demo role' }, { status: 400 });
  try {
    const response = await fetch(new URL(`/session/${role}`, process.env.TABLESYNC_DEMO_IDENTITY_URL), {
      method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Issuer unavailable');
    const { accessToken } = await response.json();
    (await cookies()).set('tablesync-demo-session', accessToken, {
      httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', path: '/', maxAge: 8 * 60 * 60,
    });
    return Response.json({ next: role === 'operator' ? '/ops' : '/restaurant/dashboard' });
  } catch { return Response.json({ error: 'Demo sign-in is unavailable. Start the demo services and retry.' }, { status: 503 }); }
}
export async function DELETE() {
  (await cookies()).delete('tablesync-demo-session');
  return Response.json({ signedOut: true });
}
