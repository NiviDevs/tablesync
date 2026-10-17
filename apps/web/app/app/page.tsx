"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure, money, type CartView, type CheckoutView, type Menu, type TableView } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { GuestCart } from '@/components/guest-cart';

type Guest = { token: string; sessionId: string; id: string; name: string };
type Operation = { operationKey: string; expectedRevision: number; checkoutId?: string; retryOf?: string };

export default function Customer() {
  const [code, setCode] = useState('');
  const [table, setTable] = useState<TableView | null>(null);
  const [menu, setMenu] = useState<Menu['items']>([]);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [cart, setCart] = useState<CartView | null>(null);
  const [checkout, setCheckout] = useState<CheckoutView | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const operationKey = guest ? `tablesync-checkout-${guest.sessionId}` : '';
  useEffect(() => {
    const value = (new URLSearchParams(location.search).get('table') ?? 'SAGE-12').toUpperCase();
    setCode(value);
    try { const saved = sessionStorage.getItem(`tablesync-guest-${value}`); if (saved) setGuest(JSON.parse(saved)); }
    catch { sessionStorage.removeItem(`tablesync-guest-${value}`); }
  }, []);
  async function recover(operation: Operation, signal?: AbortSignal) {
    if (!guest) return;
    const result = operation.checkoutId
      ? await api<CheckoutView>(`/v1/checkouts/${operation.checkoutId}`, { token: guest.token, signal })
      : await api<CheckoutView>(operation.retryOf ? `/v1/checkouts/${operation.retryOf}/retry` : `/v1/sessions/${guest.sessionId}/checkouts`, {
        method: 'POST', token: guest.token, signal, body: operation.retryOf
          ? { operationKey: operation.operationKey }
          : { operationKey: operation.operationKey, expectedRevision: operation.expectedRevision },
      });
    if (signal?.aborted) return;
    sessionStorage.setItem(operationKey, JSON.stringify({ ...operation, checkoutId: result.id }));
    setCheckout(result);
  }
  const poll = usePoll(async signal => {
    if (!code) return;
    const next = await api<TableView>(`/v1/tables/${encodeURIComponent(code)}`, { signal });
    setTable(next);
    const dishes = await api<Menu>(`/v1/menu?tableCode=${encodeURIComponent(code)}`, { signal });
    setMenu(dishes.items);
    if (!guest || expired) return;
    if (next.session?.id !== guest.sessionId) { setClosed(true); return; }
    try {
      const latest = await api<CartView>(`/v1/sessions/${guest.sessionId}/cart`, { token: guest.token, signal });
      // An in-flight poll must not overwrite a successful newer mutation.
      if (!locked.current) setCart(previous => !previous || latest.revision >= previous.revision ? latest : previous);
      const saved = sessionStorage.getItem(operationKey);
      if (saved && !locked.current) await recover(JSON.parse(saved), signal);
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.status === 401) setExpired(true);
      throw cause;
    }
  }, `${code}:${guest?.sessionId ?? ''}:${expired}`);
  async function join() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const key = `tablesync-join-${code}`;
      const saved = sessionStorage.getItem(key);
      const attempt = saved ? JSON.parse(saved) : { name: name.trim(), joinKey: crypto.randomUUID() };
      if (attempt.name !== name.trim()) throw new Error('Retry with the same name, or start a new join.');
      sessionStorage.setItem(key, JSON.stringify(attempt));
      const joined = await api<{ table: TableView; participant: { id: string; name: string }; guestToken: string }>('/v1/table-sessions/join', {
        method: 'POST', body: { tableCode: code, ...attempt },
      });
      const next = { token: joined.guestToken, sessionId: joined.table.session!.id, ...joined.participant };
      sessionStorage.setItem(`tablesync-guest-${code}`, JSON.stringify(next));
      setGuest(next); setTable(joined.table); setClosed(false); setExpired(false); setCart(null); setCheckout(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not join'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function change(menuItemId: string, quantity: number) {
    if (!guest || !cart || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const next = await api<CartView>(`/v1/sessions/${guest.sessionId}/cart/items/${encodeURIComponent(menuItemId)}`, {
        method: quantity ? 'PUT' : 'DELETE', token: guest.token,
        body: { expectedRevision: cart.revision, ...(quantity ? { quantity } : {}) },
      });
      setCart(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update cart'); }
    finally { locked.current = false; setBusy(false); poll.refresh(); }
  }
  async function pay() {
    if (!guest || !cart || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const saved = sessionStorage.getItem(operationKey);
      const operation: Operation = checkout?.status === 'FAILED'
        ? { operationKey: crypto.randomUUID(), expectedRevision: cart.revision, retryOf: checkout.id }
        : saved ? JSON.parse(saved) : { operationKey: crypto.randomUUID(), expectedRevision: cart.revision };
      sessionStorage.setItem(operationKey, JSON.stringify(operation));
      await recover(operation);
    } catch (cause) {
      if (cause instanceof ApiFailure && cause.code === 'STALE_CART') sessionStorage.removeItem(operationKey);
      setError(cause instanceof Error ? cause.message : 'Payment reply unavailable. Retry to recover the same attempt.');
    } finally { locked.current = false; setBusy(false); poll.refresh(); }
  }
  function rejoin() {
    sessionStorage.removeItem(`tablesync-guest-${code}`);
    sessionStorage.removeItem(`tablesync-join-${code}`);
    setGuest(null); setCart(null); setCheckout(null); setClosed(false); setExpired(false); setError('');
  }
  const notice = <>{(error || poll.error) && <p role="alert" className="inline-error">{error || poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}{poll.stale && <p role="status">Updates are stale. Showing the last received data.</p>}</>;
  if (!guest) return <main className="arrival-page"><Link className="brand" href="/">table<i>sync</i></Link><section className="arrival-card">
    <p className="kicker">Juniper House</p><h1>{table?.name ?? 'Your table'}</h1><p>{code} · Shared order</p>
    {notice}<label htmlFor="guest-name">What should we call you?</label><input id="guest-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" />
    <button className="primary-button full" disabled={busy || !table || !name.trim()} onClick={join}>Join the table</button>
    {error && <button onClick={() => { sessionStorage.removeItem(`tablesync-join-${code}`); setError(''); }}>Start a new join</button>}
  </section></main>;
  if (closed || expired) return <main className="arrival-page"><section className="arrival-card"><h1>{closed ? 'This seating is closed.' : 'Your guest access expired.'}</h1><p>{closed ? 'Your previous order stays with the restaurant.' : 'Rejoin to continue at this table.'}</p><button className="primary-button" onClick={rejoin}>Rejoin table</button></section></main>;
  const editable = !busy && !poll.stale && table?.session?.status === 'OPEN' && cart?.state === 'EDITING' && !sessionStorage.getItem(operationKey);
  const paymentLabel = checkout?.orderId ? 'Order received by kitchen' : checkout?.status === 'COMMITTED'
    ? 'Payment committed — order delivery pending' : checkout?.status === 'PENDING' ? 'Payment pending — checking outcome'
    : checkout?.status === 'FAILED' ? 'Payment failed — retry available' : cart?.state === 'COMMITTED' ? 'Table payment committed' : cart?.state === 'PENDING' ? 'Table payment pending' : 'Ready when your table is ready';
  return <main className="diner-page"><header className="diner-header"><Link className="brand" href="/">table<i>sync</i></Link><span>{table?.name} · {table?.session?.status}</span></header>
    {notice}<section className="diner-hero"><div><p className="kicker light">Juniper House · {code}</p><h1>Hello, {guest.name}.</h1><p>{table?.session?.participants.length ?? 0} guests at this table. Everyone can add their own dishes.</p></div></section>
    {table?.session?.status === 'CLOSING' && <p role="status">Staff are closing this seating. Ordering is paused.</p>}
    <section className="menu-section"><div className="section-heading"><h2>Today&apos;s menu</h2></div><div className="menu-grid">{menu.map(item => <article className="dish-card" key={item.id}><div className="dish-art">{item.emoji}</div><div className="dish-copy"><h3>{item.name}</h3><p>{item.description}</p></div><strong>{money(item.unitPriceMinor)}</strong><button className="round-add" disabled={!editable || !item.available || (cart?.items.find(line => line.menuItemId === item.id && line.ownerId === guest.id)?.quantity ?? 0) >= 20} aria-label={`Add ${item.name}`} onClick={() => change(item.id, (cart?.items.find(line => line.menuItemId === item.id && line.ownerId === guest.id)?.quantity ?? 0) + 1)}>+</button></article>)}</div></section>
    {cart && table ? <GuestCart cart={cart} table={table} ownerId={guest.id} disabled={!editable} change={change} /> : <p>Loading shared cart…</p>}
    <section className="payment-status"><h2 role="status">{paymentLabel}</h2><p>Simulate table payment — no money is collected.</p><p>This pays for all dishes at the table in one simulated transaction.</p>
      <button className="primary-button" disabled={busy || poll.stale || !cart?.items.length || table?.session?.status !== 'OPEN' || !!checkout?.orderId || checkout?.status === 'COMMITTED'} onClick={pay}>{busy ? 'Checking payment…' : checkout?.status === 'FAILED' ? 'Retry simulated payment' : checkout?.status === 'PENDING' ? 'Check payment outcome' : `Simulate table payment · ${money(cart?.total.amountMinor ?? 0)}`}</button>
    </section>
  </main>;
}
