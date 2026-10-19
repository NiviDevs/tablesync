"use client";
import { AnimatePresence, useIsPresent } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, type OrderView, type TableView } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { KitchenTicket } from '@/components/kitchen-ticket';
import { RestaurantNav } from '@/components/restaurant-nav';
import styles from '@/components/restaurant-workspace.module.css';

const stages = [
  { status: 'CONFIRMED', label: 'New tickets' }, { status: 'PREPARING', label: 'Preparing' }, { status: 'READY', label: 'Ready to serve' },
] as const;

export default function Restaurant() {
  const [tables, setTables] = useState<TableView[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newTable, setNewTable] = useState('');
  const locked = useRef(false);
  const [selected, setSelected] = useState<TableView | null>(null);
  const [qr, setQr] = useState('');
  const [kitchenOnly, setKitchenOnly] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [showServed, setShowServed] = useState(false);
  useEffect(() => { setKitchenOnly(new URLSearchParams(location.search).get('view') === 'kitchen'); }, []);
  const poll = usePoll(async signal => {
    try {
      const [tableResult, orderResult] = await Promise.all([
        api<{ tables: TableView[] }>('/v1/restaurant/tables', { signal }),
        api<{ orders: OrderView[] }>('/v1/restaurant/orders', { signal }),
      ]);
      if (!locked.current) { setTables(tableResult.tables); setOrders(orderResult.orders); }
    } finally { if (!signal.aborted) setLoading(false); }
  }, 'restaurant');
  useEffect(() => {
    let active = true;
    setQr('');
    if (selected) QRCode.toDataURL(`${location.origin}/app?table=${encodeURIComponent(selected.code)}`, { width: 260, margin: 2 })
      .then(value => { if (active) setQr(value); }).catch(() => { if (active) setError('Could not generate QR. Use the table link.'); });
    return () => { active = false; };
  }, [selected]);
  async function mutate(path: string, method: string, body?: unknown) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await api(path, { method, body }); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update'); }
    finally { locked.current = false; setBusy(false); poll.refresh(); }
  }
  const active = orders.filter(order => order.status !== 'SERVED').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const served = orders.filter(order => order.status === 'SERVED');
  const occupied = tables.filter(table => table.session);
  const visibleTables = tables.filter(table => `${table.name} ${table.code}`.toLowerCase().includes(tableSearch.trim().toLowerCase()) &&
    (tableFilter === 'all' || (tableFilter === 'occupied' ? !!table.session : !table.session)));
  const matchesOrder = (order: OrderView) => `${order.tableCode} ${order.id} ${order.items.map(item => item.name).join(' ')}`.toLowerCase().includes(orderSearch.trim().toLowerCase());
  const tickets = (showServed ? served : active).filter(matchesOrder);
  const metrics = kitchenOnly ? [
    ...stages.map(stage => [stage.label, loading ? '—' : active.filter(order => order.status === stage.status).length, 'Current kitchen queue']),
    ['Dishes in queue', loading ? '—' : active.reduce((sum, order) => sum + order.items.reduce((count, item) => count + item.quantity, 0), 0), 'Across all active tickets'],
  ] : [
    ['Occupied tables', loading ? '—' : occupied.length, `${tables.length} registered tables`],
    ['Available tables', loading ? '—' : tables.length - occupied.length, 'Ready for a new seating'],
    ['Guests seated', loading ? '—' : occupied.reduce((sum, table) => sum + table.session!.participants.length, 0), 'Current seating participants'],
    ['Active tickets', loading ? '—' : active.length, `${served.length} served in latest 100 orders`],
  ];
  const orderTools = <><div className={styles.tabs}><button aria-pressed={!showServed} onClick={() => setShowServed(false)}>Active ({active.length})</button><button aria-pressed={showServed} onClick={() => setShowServed(true)}>Served ({served.length})</button></div><div className={styles.panelTools}><input type="search" aria-label="Search kitchen tickets" placeholder="Search table, dish or ticket…" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} /></div></>;
  return <main className={styles.shell}><RestaurantNav active={kitchenOnly ? 'kitchen' : 'tables'} />
    <header className={styles.heading}><div><p className="kicker">Juniper House · {kitchenOnly ? 'Kitchen' : 'Floor management'}</p><h1>{kitchenOnly ? 'Kitchen workspace' : 'Tables & service'}</h1></div><p>{kitchenOnly ? 'Oldest tickets first. Move each order from the queue to the pass.' : 'Manage seatings, share table QR codes and keep orders moving.'}</p></header>
    <section className={styles.board} aria-label={kitchenOnly ? 'Kitchen orders' : 'Tables and orders'}>
      {(error || poll.error) && <p role="alert" className={styles.notice}>{error || poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}
      {poll.stale && <p role="status" className={styles.notice}>Updates are stale. Showing the last received data.</p>}
      <div className={styles.metrics}>{metrics.map(([label, value, note], index) => <m.article initial={{ opacity: .75, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .035 }} className={styles.metric} key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></m.article>)}</div>
      {kitchenOnly ? <>
        <div className={styles.kitchenTools}>{orderTools}</div>
        {showServed ? <section className={`${styles.panel} ${styles.fill}`} aria-label="Recently served tickets"><div className={styles.panelHeader}><h2>Recently served</h2><span>{tickets.length} tickets</span></div><m.div layoutScroll className={`${styles.scroll} ${styles.ticketGrid}`} tabIndex={0} role="region" aria-label="Served kitchen tickets"><AnimatePresence initial={false}>{tickets.map(order => <KitchenTicket key={order.id} order={order} busy={false} advance={() => {}} />)}</AnimatePresence>{!tickets.length && <p className={styles.empty}>{loading ? 'Loading orders…' : 'No served tickets match this view.'}</p>}</m.div></section> :
          <div className={styles.kanban}>{stages.map(stage => <section className={`${styles.panel} ${styles.lane}`} data-stage={stage.status} key={stage.status} aria-label={stage.label}>
            <div className={styles.panelHeader}><h2>{stage.label}</h2><span>{tickets.filter(order => order.status === stage.status).length}</span></div>
            <m.div layoutScroll className={`${styles.scroll} ${styles.ticketGrid}`} tabIndex={0} role="region" aria-label={`${stage.label} tickets`}><AnimatePresence initial={false}>{tickets.filter(order => order.status === stage.status).map(order => <KitchenTicket key={order.id} order={order} busy={busy || poll.stale} advance={status => mutate(`/v1/orders/${order.id}/status`, 'PATCH', { status })} />)}</AnimatePresence>
              {!tickets.some(order => order.status === stage.status) && <p className={styles.empty}>{loading ? 'Loading…' : orderSearch ? 'No matching tickets.' : 'No tickets in this stage.'}</p>}</m.div>
          </section>)}</div>}
      </> : <div className={styles.split}>
        <section className={styles.panel} aria-label="Restaurant tables"><div className={styles.panelHeader}><div><h2>Your tables</h2><p>{occupied.length} occupied / {tables.length} total</p></div>
          <form className={styles.tableForm} onSubmit={async event => { event.preventDefault(); if (await mutate('/v1/restaurant/tables', 'POST', { name: newTable })) setNewTable(''); }}><input aria-label="New table name" placeholder="e.g. Patio 4" required maxLength={80} value={newTable} onChange={event => setNewTable(event.target.value)} /><button disabled={busy || poll.stale || !newTable.trim()}>Add table</button></form></div>
          <div className={styles.panelTools}><input type="search" aria-label="Search tables" placeholder="Search tables…" value={tableSearch} onChange={event => setTableSearch(event.target.value)} /><select aria-label="Table occupancy filter" value={tableFilter} onChange={event => setTableFilter(event.target.value)}><option value="all">All tables</option><option value="occupied">Occupied</option><option value="available">Available</option></select></div>
          <m.div layoutScroll className={`${styles.scroll} ${styles.tableGrid}`} tabIndex={0} role="region" aria-label="Table registry">{visibleTables.map(table => <m.article layout="position" initial={{ opacity: .7, y: 8 }} animate={{ opacity: 1, y: 0 }} className={styles.tableCard} key={table.code} data-occupied={!!table.session}>
            <div className={styles.tableTop}><div><h3>{table.name}</h3><small>{table.code}</small></div><span>{table.session?.status === 'CLOSING' ? 'Closing' : table.session ? 'Occupied' : 'Available'}</span></div>
            {table.session ? <><p>{table.session.participants.length} guests · Seated {Math.max(0, Math.floor((Date.now() - Date.parse(table.session.openedAt)) / 60000))} min</p><p>{orders.filter(order => order.sessionId === table.session?.id && order.status !== 'SERVED').map(order => order.status).join(', ') || 'No active kitchen tickets'}</p></> : <p>Ready for the next seating.</p>}
            <div className={styles.tableActions}><button onClick={() => setSelected(table)}>Show QR</button>{table.session ? <button disabled={busy || poll.stale} onClick={() => mutate(`/v1/sessions/${table.session!.id}/close`, 'POST')}>{table.session.status === 'CLOSING' ? 'Retry close' : 'Close seating'}</button> : <button disabled={busy || poll.stale} onClick={() => mutate(`/v1/restaurant/tables/${encodeURIComponent(table.code)}`, 'DELETE')}>Remove table</button>}</div>
          </m.article>)}{!visibleTables.length && <p className={styles.empty}>{loading ? 'Loading tables…' : 'No tables match this view.'}</p>}</m.div>
        </section>
        <section className={styles.panel} aria-label="Floor kitchen queue"><div className={styles.panelHeader}><div><h2>Kitchen queue</h2><p>{tickets.length} tickets in this view</p></div><a href="/restaurant?view=kitchen">Open kitchen ↗</a></div><div className={styles.kitchenTools} style={{ padding: '0 14px 12px', flexWrap: 'wrap' }}>{orderTools}</div>
          <m.div layoutScroll className={`${styles.scroll} ${styles.ticketGrid}`} tabIndex={0} role="region" aria-label="Floor order tickets"><AnimatePresence initial={false}>{tickets.map(order => <KitchenTicket key={order.id} order={order} busy={busy || poll.stale} advance={status => mutate(`/v1/orders/${order.id}/status`, 'PATCH', { status })} />)}</AnimatePresence>{!tickets.length && !poll.error && <p className={styles.empty}>{loading ? 'Loading orders…' : orderSearch ? 'No tickets match your search.' : showServed ? 'No recently served tickets.' : 'The pass is clear. Confirmed orders appear automatically.'}</p>}</m.div>
        </section>
      </div>}
      <footer className={styles.footer}><p>Payments are simulated. No money is collected.</p><p>Kitchen counts cover the latest 100 orders · Updates every 2 seconds</p></footer>
    </section>
    <AnimatePresence>{selected && <TableQr key={selected.code} table={selected} qr={qr} close={() => setSelected(null)} />}</AnimatePresence>
  </main>;
}

function TableQr({ table, qr, close }: { table: TableView; qr: string; close: () => void }) {
  const present = useIsPresent();
  return <m.div className={`checkout-backdrop ${styles.qrBackdrop}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .16 } }} inert={!present} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
    <m.section className="qr-sheet" role="dialog" aria-modal="true" aria-label="Guest table QR" initial={{ y: 18, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: .98, transition: { duration: .16 } }}>
      <button className="close-sheet" autoFocus aria-label="Close QR" onClick={close}>×</button><p className="kicker">{table.name}</p><h2>Guest table QR</h2>{qr && <img alt={`QR code for ${table.name}`} src={qr} />}<p>Scan, enter your name, and add dishes to the shared table order.</p><a href={`/app?table=${encodeURIComponent(table.code)}`} target="_blank" rel="noreferrer">Open table link</a>
    </m.section>
  </m.div>;
}
