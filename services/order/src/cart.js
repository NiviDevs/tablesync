import { randomUUID } from 'node:crypto';

const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
export function createCartStore({ pool, sessionClient }) {
  async function view(db, sessionId) {
    const cart = (await db.query('SELECT * FROM carts WHERE session_id=$1', [sessionId])).rows[0];
    const items = cart ? (await db.query(`SELECT id,owner_id AS "ownerId",menu_item_id AS "menuItemId",item_name AS name,
      quantity,unit_price_minor AS "unitPriceMinor" FROM cart_items WHERE cart_id=$1 ORDER BY created_at,id`, [cart.id])).rows : [];
    return { sessionId, revision: cart?.revision ?? 0, state: cart?.state ?? 'EDITING', items,
      total: { amountMinor: items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0), currency: 'INR' } };
  }
  async function readCart(sessionId) { await sessionClient(sessionId); return view(pool, sessionId); }
  async function listMenu(restaurantId) {
    const items = await pool.query(`SELECT id,name,description,emoji,unit_price_minor AS "unitPriceMinor",available
      FROM menu_items WHERE restaurant_id=$1 ORDER BY id`, [restaurantId]);
    return { items: items.rows, currency: 'INR' };
  }
  async function mutate({ sessionId, participantId, menuItemId, quantity, expectedRevision }, remove = false) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || (!remove && (!Number.isInteger(quantity) || quantity < 1 || quantity > 20))) {
      fail(400, 'INVALID_CART_CHANGE', 'Quantity must be 1–20 and expectedRevision a nonnegative integer');
    }
    const table = await sessionClient(sessionId);
    if (!table.session?.participants.some(p => p.id === participantId)) fail(403, 'GUEST_NOT_MEMBER', 'Participant is not a member of this seating');
    if (table.session.status !== 'OPEN') fail(409, 'SESSION_NOT_OPEN', 'This seating is no longer open');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO carts(id,session_id) VALUES($1,$2) ON CONFLICT(session_id) DO NOTHING', [randomUUID(), sessionId]);
      const cart = (await client.query('SELECT * FROM carts WHERE session_id=$1 FOR UPDATE', [sessionId])).rows[0];
      if (cart.sealed || cart.state !== 'EDITING') fail(409, 'CART_FROZEN', 'Cart is frozen for checkout or closure');
      if (cart.revision !== expectedRevision) fail(409, 'STALE_CART', 'Cart changed; refresh and try again');
      let changed;
      if (remove) {
        changed = (await client.query('DELETE FROM cart_items WHERE cart_id=$1 AND menu_item_id=$2 AND owner_id=$3', [cart.id, menuItemId, participantId])).rowCount;
      } else {
        const item = (await client.query('SELECT * FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND available=true', [menuItemId, table.restaurantId])).rows[0];
        if (!item) fail(404, 'MENU_ITEM_UNAVAILABLE', 'Menu item is unavailable');
        await client.query(`INSERT INTO cart_items(id,cart_id,menu_item_id,owner_id,item_name,unit_price,emoji,quantity,unit_price_minor)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(cart_id,menu_item_id,owner_id)
          DO UPDATE SET quantity=EXCLUDED.quantity,item_name=EXCLUDED.item_name,unit_price=EXCLUDED.unit_price,unit_price_minor=EXCLUDED.unit_price_minor`,
        [randomUUID(), cart.id, item.id, participantId, item.name, Math.floor(item.unit_price_minor / 100), item.emoji, quantity, item.unit_price_minor]);
        changed = 1;
      }
      if (changed) await client.query('UPDATE carts SET revision=revision+1 WHERE id=$1', [cart.id]);
      const result = await view(client, sessionId);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return { readCart, listMenu, setQuantity: input => mutate(input), removeItem: input => mutate(input, true) };
}
