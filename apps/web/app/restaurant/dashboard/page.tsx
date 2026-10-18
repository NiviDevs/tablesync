"use client";
import { useState } from 'react';
import { api, money, type RestaurantAnalytics, type TableView } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { RestaurantNav } from '@/components/restaurant-nav';

const dayLabel = (value: string) => new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export default function Dashboard() {
  const [date, setDate] = useState(() => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  const [days, setDays] = useState('30');
  const [data, setData] = useState<RestaurantAnalytics | null>(null);
  const [tables, setTables] = useState<TableView[] | null>(null);
  const poll = usePoll(async signal => {
    const [analytics, registry] = await Promise.all([
      api<RestaurantAnalytics>(`/v1/restaurant/analytics?days=${days}&date=${date}`, { signal }),
      api<{ tables: TableView[] }>('/v1/restaurant/tables', { signal }),
    ]);
    if (!signal.aborted) { setData(analytics); setTables(registry.tables); }
  }, `${days}:${date}`);
  const current = data?.end === date && String(data?.days) === days ? data : null;
  const summary = current?.summary;
  const maximum = Math.max(1, ...(current?.daily.map(day => day.salesMinor) ?? []));
  const occupied = tables?.filter(table => table.session) ?? [];
  return <main className="restaurant-page"><RestaurantNav />
    <section className="restaurant-intro"><p className="kicker light">Juniper House · Business dashboard</p><h1>See how the<br />restaurant is doing.</h1><p>Served orders, popular dishes and your tables at a glance.</p></section>
    <section className="restaurant-board">
      <div className="board-heading"><div><p className="kicker">Sales overview</p><h2>{current ? `${dayLabel(current.start)} – ${dayLabel(current.end)}` : 'Loading sales…'}</h2></div>
        <div className="dashboard-filters"><label>Period<select value={days} onChange={e => setDays(e.target.value)}><option value="1">One day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
          <label>Through date<input type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label></div>
      </div>
      {poll.error && <p role="alert" className="inline-error">{poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}
      {poll.stale && <p role="status">Sales updates are stale. Showing the last received data.</p>}
      <p className="analytics-note">Simulated sales · Served orders only · Order date in Asia/Kolkata. No real money is collected.</p>
      <div className="business-metrics">
        <article><p>Simulated sales</p><strong>{summary ? money(summary.salesMinor) : '—'}</strong><small>From served orders</small></article>
        <article><p>Orders served</p><strong>{summary?.orders ?? '—'}</strong><small>In selected period</small></article>
        <article><p>Dishes served</p><strong>{summary?.quantity ?? '—'}</strong><small>{summary ? `${summary.guests} ordering guests` : 'Loading…'}</small></article>
        <article><p>Average order</p><strong>{summary ? money(summary.orders ? Math.round(summary.salesMinor / summary.orders) : 0) : '—'}</strong><small>Simulated amount per order</small></article>
      </div>
      <div className="dashboard-section"><div className="board-heading"><div><p className="kicker">Day by day</p><h2>Sales and order volume</h2></div><span className="quiet-note">Select a day to see its dishes</span></div>
        {current && <><div className="sales-chart" aria-label="Simulated sales by day">{current.daily.map(day => <button key={day.date} className="sales-chart-column" title={`${dayLabel(day.date)}: ${money(day.salesMinor)}, ${day.orders} orders`} onClick={() => { setDate(day.date); setDays('1'); }} aria-label={`View ${dayLabel(day.date)}: ${money(day.salesMinor)}, ${day.orders} orders`}><span className="sales-chart-track"><span className={day.salesMinor ? 'sales-chart-bar' : 'sales-chart-zero'} style={{ height: `${day.salesMinor ? Math.max(3, day.salesMinor / maximum * 100) : 1}%` }} /></span><small>{day.date.slice(8)}</small></button>)}</div>
          <details className="daily-details"><summary>Daily sales and order counts</summary><div className="data-table-wrap"><table className="business-table"><thead><tr><th>Date</th><th>Orders</th><th>Simulated sales</th></tr></thead><tbody>{current.daily.map(day => <tr key={day.date}><td><button className="text-button" onClick={() => { setDate(day.date); setDays('1'); }}>{dayLabel(day.date)}</button></td><td>{day.orders}</td><td>{money(day.salesMinor)}</td></tr>)}</tbody></table></div></details>
        </>}
      </div>
      <div className="dashboard-section"><div className="board-heading"><div><p className="kicker">Dish performance</p><h2>What guests are ordering</h2></div></div>
        {current?.dishes.length ? <div className="data-table-wrap"><table className="business-table"><thead><tr><th>Dish</th><th>Quantity</th><th>Orders</th><th>Simulated sales</th></tr></thead><tbody>{current.dishes.map((dish, index) => <tr key={dish.id}><td><span className="dish-rank">{index + 1}</span>{dish.name}</td><td>{dish.quantity}</td><td>{dish.orders}</td><td>{money(dish.salesMinor)}</td></tr>)}</tbody></table></div> : <p className="quiet-note">{current ? 'No served dishes in this period. Completed kitchen orders will appear here.' : 'Loading dish performance…'}</p>}
      </div>
      <div className="dashboard-section"><div className="board-heading"><div><p className="kicker">Tables right now</p><h2>{tables ? `${occupied.length} occupied / ${tables.length} tables` : 'Loading tables…'}</h2></div><a className="owner-link" href="/restaurant">Manage tables</a></div>
        <div className="business-metrics"><article><p>Guests seated now</p><strong>{tables ? occupied.reduce((sum, table) => sum + table.session!.participants.length, 0) : '—'}</strong><small>Seated guests, not online users</small></article><article><p>Available tables</p><strong>{tables ? tables.length - occupied.length : '—'}</strong><small>Ready for the next seating</small></article></div>
        {!!current?.tables.length && <div className="data-table-wrap"><table className="business-table"><thead><tr><th>Table</th><th>Orders served</th><th>Simulated sales</th></tr></thead><tbody>{current.tables.map(table => <tr key={table.code}><td>{tables?.find(entry => entry.code === table.code)?.name ?? table.code}</td><td>{table.orders}</td><td>{money(table.salesMinor)}</td></tr>)}</tbody></table></div>}
      </div>
      {current && <p className="quiet-note">Updated {new Date(current.generatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · All recorded orders in this period, including past menu names and prices.</p>}
    </section>
  </main>;
}
