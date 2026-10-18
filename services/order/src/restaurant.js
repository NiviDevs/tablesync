import { randomUUID } from 'node:crypto';

const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
export function createRestaurantStore({ pool }) {
  async function saveDish({ restaurantId, id, body }) {
    const allowed = ['name', 'description', 'emoji', 'unitPriceMinor', 'available'];
    if (!body || Object.keys(body).some(key => !allowed.includes(key)) ||
      typeof body.name !== 'string' || !body.name.trim() || [...body.name.trim()].length > 120 ||
      typeof body.description !== 'string' || body.description.length > 500 ||
      typeof body.emoji !== 'string' || !body.emoji.trim() || [...body.emoji].length > 16 ||
      !Number.isSafeInteger(body.unitPriceMinor) || body.unitPriceMinor < 100 || body.unitPriceMinor > 10000000 ||
      typeof body.available !== 'boolean') {
      fail(400, 'INVALID_DISH', 'Provide a name, description, icon, price between ₹1 and ₹100,000, and availability');
    }
    const values = [id ?? randomUUID(), restaurantId, body.name.trim(), body.description.trim(), body.emoji.trim(), body.unitPriceMinor, body.available];
    const result = id ? await pool.query(`UPDATE menu_items SET name=$3,description=$4,emoji=$5,unit_price_minor=$6,available=$7
      WHERE id=$1 AND restaurant_id=$2 RETURNING id`, values)
      : await pool.query(`INSERT INTO menu_items(id,restaurant_id,name,description,emoji,unit_price_minor,available)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, values);
    if (!result.rowCount) fail(404, 'DISH_NOT_FOUND', 'Dish not found for this restaurant');
    return { id: result.rows[0].id, ...body, name: values[2], description: values[3], emoji: values[4] };
  }
  async function analytics({ restaurantId, days: inputDays = '30', date: inputDate }) {
    const days = Number(inputDays);
    const date = inputDate ?? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    if (![1, 7, 30, 90].includes(days) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < '2000-01-01' || date > '2100-12-31') {
      fail(400, 'INVALID_ANALYTICS_RANGE', 'Select a valid end date and 1, 7, 30 or 90 days');
    }
    const start = new Date(Date.parse(date) - (days - 1) * 86400000).toISOString().slice(0, 10);
    const result = await pool.query(`WITH orders AS (
      SELECT * FROM consolidated_orders WHERE restaurant_id=$1 AND checkout_id IS NOT NULL AND status='SERVED'
        AND created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    ), lines AS (
      SELECT i.*,o.table_code,o.created_at AS ordered_at FROM consolidated_order_items i JOIN orders o ON o.id=i.order_id
    ), daily AS (
      SELECT to_char(day,'YYYY-MM-DD') AS date,count(o.id) AS orders,COALESCE(sum(o.total_amount_minor),0) AS "salesMinor"
      FROM generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') day
      LEFT JOIN orders o ON (o.created_at AT TIME ZONE 'Asia/Kolkata')::date=day::date GROUP BY day ORDER BY day
    ), dishes AS (
      SELECT menu_item_id AS id,(array_agg(item_name ORDER BY ordered_at DESC))[1] AS name,
        sum(quantity) AS quantity,count(DISTINCT order_id) AS orders,sum(quantity::bigint*unit_price_minor) AS "salesMinor"
      FROM lines GROUP BY menu_item_id ORDER BY sum(quantity) DESC,menu_item_id
    ), tables AS (
      SELECT table_code AS code,count(*) AS orders,sum(total_amount_minor) AS "salesMinor"
      FROM orders GROUP BY table_code ORDER BY sum(total_amount_minor) DESC,table_code
    ) SELECT jsonb_build_object(
      'summary',jsonb_build_object('orders',(SELECT count(*) FROM orders),
        'salesMinor',(SELECT COALESCE(sum(total_amount_minor),0) FROM orders),
        'guests',(SELECT count(DISTINCT owner_id) FROM lines),
        'quantity',(SELECT COALESCE(sum(quantity),0) FROM lines)),
      'daily',COALESCE((SELECT jsonb_agg(daily) FROM daily),'[]'::jsonb),
      'dishes',COALESCE((SELECT jsonb_agg(dishes) FROM dishes),'[]'::jsonb),
      'tables',COALESCE((SELECT jsonb_agg(tables) FROM tables),'[]'::jsonb)
    ) AS data`, [restaurantId, start, date]);
    return { ...result.rows[0].data, start, end: date, days, timezone: 'Asia/Kolkata', simulated: true, generatedAt: new Date().toISOString() };
  }
  return { saveDish, analytics };
}
