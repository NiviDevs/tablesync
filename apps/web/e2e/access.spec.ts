import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { fixture, query } from './fixture';

test('proxy and gateway enforce staff, guest, origin and internal boundaries', async ({ request, page }) => {
  const state = fixture();
  const joinedResponse = await request.post('/api/backend/v1/table-sessions/join', { data: { tableCode: 'SAGE-12', name: 'Access fixture', joinKey: randomUUID() } });
  expect(joinedResponse.status()).toBe(201);
  const joined = await joinedResponse.json();
  const sessionId = joined.table.session.id;
  const headers = { authorization: `Bearer ${joined.guestToken}` };
  expect((await request.get(`/api/backend/v1/sessions/${randomUUID()}/cart`, { headers })).status()).toBe(403);
  const anonymousClose = await request.post(`/api/backend/v1/sessions/${sessionId}/close`, { headers: { origin: state.origin } });
  expect(anonymousClose.status(), await anonymousClose.text()).toBe(401);
  expect((await request.post(`/api/backend/v1/sessions/${sessionId}/close`, { headers: { ...headers, origin: state.origin } })).status()).toBe(401);
  expect((await request.post(`/api/backend/v1/sessions/${sessionId}/close`, { headers: { authorization: `Bearer ${state.staffToken}`, origin: 'https://foreign.test' } })).status()).toBe(403);
  expect((await request.get(`${state.gateway}/v1/ops/overview`, { headers: { authorization: `Bearer ${state.staffToken}` } })).status()).toBe(403);
  expect((await request.get('/api/backend/v1/restaurant/tables', { headers: { 'x-restaurant-id': joined.table.restaurantId, 'x-internal-secret': 'forged' } })).status()).toBe(401);
  const updated = await request.put(`/api/backend/v1/sessions/${sessionId}/cart/items/paneer`, {
    headers: { ...headers, 'x-participant-id': randomUUID(), 'x-session-id': randomUUID(), 'x-restaurant-id': randomUUID() }, data: { quantity: 1, expectedRevision: 0 },
  });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).items[0].ownerId).toBe(joined.participant.id);
  const expired = await new SignJWT({ sessionId }).setProtectedHeader({ alg: 'HS256' }).setSubject(joined.participant.id)
    .setIssuer('tablesync:guest').setAudience('tablesync:table').setIssuedAt(1).setExpirationTime(2).sign(new TextEncoder().encode(state.guestSecret));
  expect((await request.get(`/api/backend/v1/sessions/${sessionId}/cart`, { headers: { authorization: `Bearer ${expired}` } })).status()).toBe(401);
  await page.goto('/app?table=SAGE-12');
  await page.evaluate(guest => sessionStorage.setItem('tablesync-guest-SAGE-12', JSON.stringify(guest)), {
    token: expired, sessionId, id: joined.participant.id, name: 'Expired guest',
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your guest access expired.' })).toBeVisible();
  expect((await request.post('/api/backend/v1/table-sessions/join', { data: { name: 'x'.repeat(17000) } })).status()).toBe(413);
  expect((await request.get('/api/backend/v1/sessions/id/internal')).status()).toBe(404);
  await request.post(`/api/backend/v1/sessions/${sessionId}/close`, { headers: { authorization: `Bearer ${state.staffToken}`, origin: state.origin } });
});

test('unknown table and refresh failures remain visible without creating data', async ({ page }) => {
  const before = (await query('SELECT count(*)::int AS count FROM table_sessions'))[0].count;
  await page.goto('/app?table=UNKNOWN-404');
  await expect(page.locator('p[role=alert]')).toContainText('This table link is not active');
  expect((await query('SELECT count(*)::int AS count FROM table_sessions'))[0].count).toBe(before);
  await page.route('**/api/backend/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Injected dependency outage' } }) }));
  await page.goto('/app?table=SAGE-12');
  await expect(page.locator('p[role=alert]')).toContainText('Injected dependency outage');
  await expect(page.getByRole('status')).toContainText('Updates are stale');
  await page.unroute('**/api/backend/**');
  await page.getByRole('button', { name: 'Retry refresh' }).click();
  await expect(page.locator('p[role=alert]')).toHaveCount(0);
});
