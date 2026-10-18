"use client";
import { useRef, useState, type FormEvent } from 'react';
import { api, money, type Menu, type MenuItem } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { RestaurantNav } from '@/components/restaurant-nav';

const blank = { name: '', description: '', emoji: '🍽️', price: '', available: true };
export default function RestaurantMenu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const poll = usePoll(async signal => {
    try { const result = await api<Menu>('/v1/restaurant/menu', { signal }); setItems(result.items); }
    finally { if (!signal.aborted) setLoading(false); }
  }, 'menu');
  function edit(item: MenuItem) {
    setEditing(item.id); setDraft({ name: item.name, description: item.description, emoji: item.emoji,
      price: (item.unitPriceMinor / 100).toFixed(2), available: item.available }); setError(''); setMessage('');
    document.getElementById('dish-name')?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (!/^\d+(\.\d{1,2})?$/.test(draft.price)) { setError('Enter a price with at most two decimal places.'); return; }
    const [rupees, paise = ''] = draft.price.split('.');
    const unitPriceMinor = Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
    await write(editing, { name: draft.name, description: draft.description, emoji: draft.emoji, available: draft.available, unitPriceMinor });
  }
  async function write(id: string | null, fields: Omit<MenuItem, 'id'>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await api(id ? `/v1/restaurant/menu/${encodeURIComponent(id)}` : '/v1/restaurant/menu', { method: id ? 'PUT' : 'POST', body: fields });
      setMessage(id ? 'Dish updated.' : 'Dish added.');
      if (id === editing || !id) { setEditing(null); setDraft(blank); }
      poll.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save dish'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <main className="restaurant-page"><RestaurantNav />
    <section className="restaurant-intro"><p className="kicker light">Juniper House · Menu</p><h1>Your dishes,<br />your menu.</h1><p>Add dishes, change prices and mark what is available today.</p></section>
    <section className="restaurant-board">
      {(error || poll.error) && <p role="alert" className="inline-error">{error || poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}
      {poll.stale && <p role="status">Menu updates are stale. Showing the last received menu.</p>}
      {message && <p role="status" className="success-note">{message}</p>}
      <div className="owner-menu-layout"><div><div className="board-heading"><div><p className="kicker">Dish catalog</p><h2>{loading ? 'Loading…' : `${items.filter(item => item.available).length} available / ${items.length} dishes`}</h2></div></div>
        <div className="owner-menu-list">{items.map(item => <article className="owner-dish" key={item.id}>
          <span className="owner-dish-icon" aria-hidden="true">{item.emoji}</span><div><h3>{item.name}</h3><p>{item.description || 'No description'}</p><strong>{money(item.unitPriceMinor)}</strong><span className={`availability ${item.available ? '' : 'unavailable'}`}>{item.available ? 'Available' : 'Hidden from ordering'}</span></div>
          <div className="owner-dish-actions"><button disabled={busy} onClick={() => edit(item)}>Edit</button><button disabled={busy || poll.stale} onClick={() => { const { id, ...fields } = item; void write(id, { ...fields, available: !item.available }); }}>{item.available ? 'Hide dish' : 'Make available'}</button></div>
        </article>)}{!loading && !items.length && !poll.error && <p>No dishes yet. Add your first dish using the form.</p>}</div>
      </div><form className="dish-form" onSubmit={save}><p className="kicker">{editing ? 'Edit dish' : 'New dish'}</p><h2>{editing ? 'Update your dish' : 'Add to the menu'}</h2>
        <label htmlFor="dish-name">Dish name</label><input id="dish-name" required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <label htmlFor="dish-description">Description</label><textarea id="dish-description" maxLength={500} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
        <div className="dish-form-row"><div><label htmlFor="dish-icon">Icon</label><input id="dish-icon" required maxLength={24} value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value })} /></div>
          <div><label htmlFor="dish-price">Price (₹)</label><input id="dish-price" required type="number" min="1" max="100000" step="0.01" inputMode="decimal" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} /></div></div>
        <label className="checkbox-label"><input type="checkbox" checked={draft.available} onChange={e => setDraft({ ...draft, available: e.target.checked })} />Available to order</label>
        <button className="primary-button full" disabled={busy || poll.stale}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add dish'}</button>
        {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setDraft(blank); }}>Cancel editing</button>}
        <p className="quiet-note">Hiding a dish stops new additions. Price changes apply when guests next add or change a dish. Submitted orders keep their saved prices.</p>
      </form></div>
    </section>
  </main>;
}
