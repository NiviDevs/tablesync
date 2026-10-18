import { test, expect } from '@playwright/test';
import { control, fixture, query } from './fixture';

test('two guests share one durable order; kitchen serves, closes and seats the next guests', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const staff = await browser.newContext({ extraHTTPHeaders: { authorization: `Bearer ${fixture().staffToken}` } });
  const maya = await first.newPage();
  const noor = await second.newPage();
  const kitchen = await staff.newPage();
  try {
    for (const [page, name] of [[maya, 'Maya'], [noor, 'Noor']] as const) {
      await page.goto('/app?table=SAGE-12');
      await page.getByLabel('What should we call you?').fill(name);
      await page.getByRole('button', { name: 'Join the table', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Hello, ${name}.` })).toBeVisible();
    }
    await maya.getByRole('button', { name: 'Add Smoked butter paneer', exact: true }).click();
    await expect(noor.getByTestId('cart-line')).toHaveCount(1, { timeout: 3000 });
    await expect(noor.getByRole('button', { name: 'Remove Smoked butter paneer' })).toHaveCount(0);
    await noor.getByRole('button', { name: 'Add Chilli garlic noodles', exact: true }).click();
    await expect(maya.getByTestId('cart-line')).toHaveCount(2, { timeout: 3000 });
    await expect(maya.getByRole('heading', { name: 'Table total · ₹620.00' })).toBeVisible();
    await maya.getByRole('button', { name: 'Increase Smoked butter paneer' }).click();
    await expect(noor.getByRole('heading', { name: 'Table total · ₹960.00' })).toBeVisible({ timeout: 3000 });
    await maya.getByRole('button', { name: 'Decrease Smoked butter paneer' }).click();
    await expect(noor.getByRole('heading', { name: 'Table total · ₹620.00' })).toBeVisible({ timeout: 3000 });
    const guest = await maya.evaluate(() => JSON.parse(sessionStorage.getItem('tablesync-guest-SAGE-12')!));
    // An actual unavailable Payment process leaves durable PENDING state.
    await control('stop-payment');
    let lostCheckoutId = '';
    await maya.route('**/api/backend/v1/sessions/*/checkouts', async route => {
      const response = await route.fetch();
      lostCheckoutId = (await response.json()).id;
      await route.abort('failed');
    }, { times: 1 });
    await maya.getByRole('button', { name: 'Simulate table payment · ₹620.00' }).dblclick();
    await expect.poll(() => lostCheckoutId).not.toBe('');
    await maya.reload();
    await expect(maya.getByRole('status').filter({ hasText: 'Payment pending — checking outcome' })).toBeVisible();
    const saved = await maya.evaluate(id => JSON.parse(sessionStorage.getItem(`tablesync-checkout-${id}`)!), guest.sessionId);
    expect(saved.checkoutId).toBe(lostCheckoutId);
    await maya.reload();
    await expect(maya.getByRole('status').filter({ hasText: 'Payment pending — checking outcome' })).toBeVisible();
    expect(await maya.evaluate(id => JSON.parse(sessionStorage.getItem(`tablesync-checkout-${id}`)!).checkoutId, guest.sessionId)).toBe(saved.checkoutId);
    await control('start-payment');
    await expect(maya.getByRole('status').filter({ hasText: 'Order received by kitchen' })).toBeVisible({ timeout: 25000 });
    expect((await query('SELECT count(*)::int AS count FROM consolidated_orders WHERE session_id=$1', [guest.sessionId]))[0].count).toBe(1);
    await kitchen.goto('/restaurant?view=kitchen');
    await expect(kitchen.getByTestId('kitchen-ticket')).toHaveCount(1);
    await control('restart-order');
    await kitchen.reload();
    await expect(kitchen.getByTestId('kitchen-ticket')).toHaveCount(1);
    await kitchen.getByRole('button', { name: 'Start preparing' }).click();
    await kitchen.getByRole('button', { name: 'Mark ready' }).click();
    await kitchen.getByRole('button', { name: 'Mark served' }).click();
    await expect(kitchen.getByTestId('kitchen-ticket')).toHaveCount(0);
    await kitchen.goto('/restaurant');
    await kitchen.getByRole('button', { name: 'Show QR' }).click();
    await expect(kitchen.getByRole('img', { name: /QR code for/ })).toHaveAttribute('src', /^data:image\/png/);
    await kitchen.getByRole('button', { name: 'Close QR' }).click();
    await kitchen.getByRole('button', { name: 'Close seating' }).click();
    await expect(maya.getByRole('heading', { name: 'This seating is closed.' })).toBeVisible({ timeout: 3000 });
    await expect(noor.getByRole('heading', { name: 'This seating is closed.' })).toBeVisible({ timeout: 3000 });
    await maya.getByRole('button', { name: 'Rejoin table' }).click();
    await maya.getByLabel('What should we call you?').fill('Maya');
    await maya.getByRole('button', { name: 'Join the table', exact: true }).click();
    await expect(maya.getByRole('heading', { name: 'Hello, Maya.' })).toBeVisible();
    const next = await maya.evaluate(() => JSON.parse(sessionStorage.getItem('tablesync-guest-SAGE-12')!));
    expect(next.sessionId).not.toBe(guest.sessionId);
    expect((await query('SELECT status FROM consolidated_orders WHERE session_id=$1', [guest.sessionId]))[0].status).toBe('SERVED');
  } finally { await control('start-payment'); await Promise.all([first.close(), second.close(), staff.close()]); }
});
