"use client";
import * as m from 'motion/react-m';
import { useState } from 'react';
import { api, money, type RestaurantAnalytics, type TableView } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { RestaurantNav } from '@/components/restaurant-nav';
import styles from '@/components/restaurant-workspace.module.css';

const dayLabel = (value: string) => new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export default function Dashboard() {
  const [date, setDate] = useState(() => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  const [days, setDays] = useState('30');
  const [data, setData] = useState<RestaurantAnalytics | null>(null);
  const [tables, setTables] = useState<TableView[] | null>(null);
  const [dailyTable, setDailyTable] = useState(false);
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
  const occupancy = tables?.length ? Math.round(occupied.length / tables.length * 100) : 0;
  const seated = occupied.reduce((sum, table) => sum + table.session!.participants.length, 0);
  function selectDay(value: string) { setDate(value); setDays('1'); }
  return <main className={styles.shell}><RestaurantNav active="dashboard" />
    <header className={styles.heading}><div><p className="kicker">Juniper House · Business dashboard</p><h1>Restaurant overview</h1></div>
      <div className={styles.filters}><label>Period<select value={days} onChange={event => setDays(event.target.value)}><option value="1">One day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
        <label>Through date<input type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label></div>
    </header>
    <section className={styles.board} aria-label="Restaurant business metrics">
      {poll.error && <p role="alert" className={styles.notice}>{poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}
      {poll.stale && <p role="status" className={styles.notice}>Sales updates are stale. Showing the last received data.</p>}
      <div className={`${styles.metrics} ${styles.metricsSix}`}>{[
        ['Simulated sales', summary ? money(summary.salesMinor) : '—', 'Served orders · selected period'],
        ['Orders served', summary?.orders ?? '—', 'Selected period'],
        ['Dishes served', summary?.quantity ?? '—', 'Total dish quantities'],
        ['Average order', summary ? money(summary.orders ? Math.round(summary.salesMinor / summary.orders) : 0) : '—', 'Simulated amount per order'],
        ['Table occupancy', tables ? `${occupancy}%` : '—', tables ? `${occupied.length} occupied / ${tables.length} tables · live` : 'Loading tables…'],
        ['Guests seated', tables ? seated : '—', 'Current seating participants · live'],
      ].map(([label, value, note], index) => <m.article initial={{ opacity: .75, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .035 }} className={styles.metric} key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></m.article>)}</div>
      <div className={styles.analyticsGrid}>
        <section className={styles.panel} aria-label="Sales and order volume">
          <div className={styles.panelHeader}><div><h2>Sales & order volume</h2><p>{current ? `${dayLabel(current.start)} – ${dayLabel(current.end)}` : 'Loading sales…'}</p></div><div className={styles.tabs}><button aria-pressed={!dailyTable} onClick={() => setDailyTable(false)}>Chart</button><button aria-pressed={dailyTable} onClick={() => setDailyTable(true)}>Daily totals</button></div></div>
          {current ? dailyTable ? <div className={`${styles.scroll} ${styles.fill}`} tabIndex={0} role="region" aria-label="Daily sales totals"><table className={styles.dataTable}><thead><tr><th>Date</th><th>Orders</th><th>Simulated sales</th></tr></thead><tbody>{current.daily.map(day => <tr key={day.date}><td><button onClick={() => selectDay(day.date)}>{dayLabel(day.date)}</button></td><td>{day.orders}</td><td>{money(day.salesMinor)}</td></tr>)}</tbody></table></div> : <div className={styles.chart} aria-label="Simulated sales by day">{current.daily.map((day, index) => <button key={day.date} title={`${dayLabel(day.date)}: ${money(day.salesMinor)}, ${day.orders} orders`} onClick={() => selectDay(day.date)} aria-label={`View ${dayLabel(day.date)}: ${money(day.salesMinor)}, ${day.orders} orders`}><span className={styles.chartTrack}><m.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: Math.min(index, 12) * .012, type: 'spring', stiffness: 220, damping: 24 }} style={{ transformOrigin: 'bottom', height: `${day.salesMinor ? Math.max(3, day.salesMinor / maximum * 100) : 1}%`, opacity: day.salesMinor ? 1 : .35 }} /></span><small>{day.date.slice(8)}</small></button>)}</div> : <p className={styles.empty}>Loading daily sales…</p>}
          <div className={styles.miniMetrics}>{[
            ['Average daily sales', current ? money(Math.round(current.summary.salesMinor / current.days)) : '—'],
            ['Sales per ordering guest', summary ? money(summary.guests ? Math.round(summary.salesMinor / summary.guests) : 0) : '—'],
            ['Dishes per order', summary ? (summary.orders ? summary.quantity / summary.orders : 0).toFixed(1) : '—'],
            ['Days with served orders', current ? `${current.daily.filter(day => day.orders > 0).length} / ${current.days}` : '—'],
          ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div className={styles.panelFooter}>Select a chart bar or date to inspect one day.</div>
        </section>
        <section className={styles.panel} aria-label="Dish performance"><div className={styles.panelHeader}><div><h2>Dish performance</h2><p>Ranked by quantity served</p></div><span>{current?.dishes.length ?? '—'} dishes</span></div>
          <div className={`${styles.scroll} ${styles.fill}`} tabIndex={0} role="region" aria-label="Served dish performance">{current?.dishes.length ? <table className={styles.dataTable}><thead><tr><th>Dish</th><th>Qty / orders</th><th>Sales</th></tr></thead><tbody>{current.dishes.map((dish, index) => <tr key={dish.id}><td><span className={styles.rank}>{index + 1}</span>{dish.name}</td><td>{dish.quantity} / {dish.orders}</td><td>{money(dish.salesMinor)}</td></tr>)}</tbody></table> : <p className={styles.empty}>{current ? 'No served dishes in this period. Served kitchen orders appear here.' : 'Loading dish performance…'}</p>}</div>
          <div className={styles.panelFooter}>{summary ? `${summary.guests} unique ordering guests in this period` : 'Loading ordering guests…'}</div>
        </section>
        <section className={styles.panel} aria-label="Table performance"><div className={styles.panelHeader}><div><h2>Tables & guests</h2><p>Live floor and period performance</p></div><a href="/restaurant">Manage ↗</a></div>
          <div className={styles.occupancy}><div><span>{tables ? `${occupied.length} occupied` : 'Loading…'}</span><span>{tables ? `${tables.length - occupied.length} available` : '—'}</span></div><div className={styles.occupancyTrack}><m.span initial={false} animate={{ scaleX: occupancy / 100 }} style={{ width: '100%', transformOrigin: 'left' }} /></div></div>
          <div className={`${styles.scroll} ${styles.fill}`} tabIndex={0} role="region" aria-label="Served orders by table">{current?.tables.length ? <table className={styles.dataTable}><thead><tr><th>Table</th><th>Orders</th><th>Sales</th></tr></thead><tbody>{current.tables.map(table => <tr key={table.code}><td>{tables?.find(entry => entry.code === table.code)?.name ?? table.code}</td><td>{table.orders}</td><td>{money(table.salesMinor)}</td></tr>)}</tbody></table> : <p className={styles.empty}>{current ? 'No served orders for this period.' : 'Loading table performance…'}</p>}</div>
          <div className={styles.miniMetrics}><div><span>Tables with served orders</span><strong>{current?.tables.length ?? '—'}</strong></div><div><span>Average current party</span><strong>{tables ? (occupied.length ? seated / occupied.length : 0).toFixed(1) : '—'}</strong></div></div>
        </section>
      </div>
      <footer className={styles.footer}><p>Simulated sales · Served orders only · Order date in Asia/Kolkata. No money is collected.</p><p>{current ? `Updated ${new Date(current.generatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · Saved order prices` : 'Waiting for analytics…'}</p></footer>
    </section>
  </main>;
}
