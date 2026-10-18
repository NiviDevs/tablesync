"use client";
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, type OrderView, type TableView } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { KitchenTicket } from '@/components/kitchen-ticket';
import { RestaurantNav } from '@/components/restaurant-nav';

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
  const active = orders.filter(order => order.status !== 'SERVED');
  return <main className="restaurant-page"><RestaurantNav />
    <section className="restaurant-intro"><p className="kicker light">Juniper House · {kitchenOnly ? 'Kitchen' : 'Restaurant portal'}</p><h1>{kitchenOnly ? 'Orders to prepare.' : 'Tables and orders, in one place.'}</h1><p>Guests share a table order. Payments are simulated; no money is collected.</p></section>
    <section className="restaurant-board">{(error || poll.error) && <p role="alert" className="inline-error">{error || poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}{poll.stale && <p role="status">Updates are stale. Showing the last received data.</p>}
      {!kitchenOnly && <><div className="board-heading"><div><p className="kicker">Your tables</p><h2>{loading ? 'Loading…' : `${tables.filter(table => table.session).length} occupied / ${tables.length} tables`}</h2></div>
        <form className="table-create" onSubmit={async event => { event.preventDefault(); if (await mutate('/v1/restaurant/tables', 'POST', { name: newTable })) setNewTable(''); }}><input aria-label="New table name" placeholder="e.g. Patio 4" required maxLength={80} value={newTable} onChange={event => setNewTable(event.target.value)} /><button disabled={busy || poll.stale || !newTable.trim()}>Add table</button></form></div>
      <div className="table-list">{tables.map(table => <article key={table.code}><div><strong>{table.name}</strong><small>{table.code} · {table.session?.status ?? 'Available'}</small>{table.session && <><p>{table.session.participants.length} guests · seated {Math.max(0, Math.floor((Date.now() - Date.parse(table.session.openedAt)) / 60000))} min</p><p>{orders.filter(order => order.sessionId === table.session?.id).map(order => order.status).join(', ') || 'Choosing dishes'}</p></>}</div><div className="table-actions"><button onClick={() => setSelected(table)}>Show QR</button>{table.session && <button disabled={busy || poll.stale} onClick={() => mutate(`/v1/sessions/${table.session!.id}/close`, 'POST')}>{table.session.status === 'CLOSING' ? 'Retry close' : 'Close seating'}</button>}{!table.session && <button className="remove-table" disabled={busy || poll.stale} onClick={() => mutate(`/v1/restaurant/tables/${encodeURIComponent(table.code)}`, 'DELETE')}>Remove table</button>}</div></article>)}</div></>}
      <div className="board-heading order-heading"><div><p className="kicker">Kitchen queue</p><h2>{loading ? 'Loading orders…' : `${active.length} active tickets`}</h2></div></div>
      <div className="order-list">{active.map(order => <KitchenTicket key={order.id} order={order} busy={busy || poll.stale} advance={status => mutate(`/v1/orders/${order.id}/status`, 'PATCH', { status })} />)}{!loading && !active.length && !poll.error && <div className="empty-orders"><h3>The pass is clear.</h3><p>Confirmed table orders appear here automatically.</p></div>}</div>
      {!kitchenOnly && orders.some(order => order.status === 'SERVED') && <details><summary>Recently served orders (within latest 100 orders)</summary><div className="order-list">{orders.filter(order => order.status === 'SERVED').map(order => <KitchenTicket key={order.id} order={order} busy={false} advance={() => {}} />)}</div></details>}
    </section>
    {selected && <div className="checkout-backdrop"><section className="qr-sheet" role="dialog" aria-modal="true" aria-label="Guest table QR"><button className="close-sheet" aria-label="Close QR" onClick={() => setSelected(null)}>×</button><p className="kicker">{selected.name}</p><h2>Guest table QR</h2>{qr && <img alt={`QR code for ${selected.name}`} src={qr} />}<p>Scan, enter your name, and add dishes to the shared table order.</p><a href={`/app?table=${encodeURIComponent(selected.code)}`} target="_blank" rel="noreferrer">Open table link</a></section></div>}
  </main>;
}
