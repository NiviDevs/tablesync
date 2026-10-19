"use client";
import { useRef, useState, type FormEvent } from 'react';
import { api, money, type Menu, type MenuItem } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { RestaurantNav } from '@/components/restaurant-nav';
import styles from '@/components/restaurant-workspace.module.css';

const blank = { name: '', description: '', emoji: '🍽️', price: '', available: true };
export default function RestaurantMenu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
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
  const available = items.filter(item => item.available).length;
  const visible = items.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (availability === 'all' || (availability === 'available' ? item.available : !item.available)));
  return <main className={styles.shell}><RestaurantNav active="menu" />
    <header className={styles.heading}><div><p className="kicker">Juniper House · Dish management</p><h1>Your menu, at a glance</h1></div><p>Keep dishes, prices and availability up to date.</p></header>
    <section className={styles.board} aria-label="Menu management">
      {(error || poll.error) && <p role="alert" className={styles.notice}>{error || poll.error} <button onClick={poll.refresh}>Retry refresh</button></p>}
      {poll.stale && <p role="status" className={styles.notice}>Menu updates are stale. Showing the last received menu.</p>}
      {message && <p role="status" className={`${styles.notice} ${styles.success}`}>{message}</p>}
      <div className={styles.metrics}>{[
        ['Total dishes', items.length, 'All catalog entries'], ['Available to order', available, 'Visible to guests'],
        ['Hidden dishes', items.length - available, 'Kept in your catalog'],
        ['Average listed price', money(items.length ? Math.round(items.reduce((sum, item) => sum + item.unitPriceMinor, 0) / items.length) : 0), 'Across the whole catalog'],
      ].map(([label, value, note]) => <article className={styles.metric} key={label}><p>{label}</p><strong>{loading ? '—' : value}</strong><small>{note}</small></article>)}</div>
      <div className={styles.menuGrid}>
        <section className={styles.panel} aria-label="Dish catalog"><div className={styles.panelHeader}><div><h2>Dish catalog</h2><p>{loading ? 'Loading dishes…' : `${visible.length} of ${items.length} dishes shown`}</p></div><span>{available} available</span></div>
          <div className={styles.panelTools}><input type="search" aria-label="Search dishes" placeholder="Search dish name or description…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Dish availability filter" value={availability} onChange={event => setAvailability(event.target.value)}><option value="all">All dishes</option><option value="available">Available</option><option value="hidden">Hidden</option></select></div>
          <div className={`${styles.scroll} ${styles.menuList}`} tabIndex={0} role="region" aria-label="Menu dishes">{visible.map(item => <article className="owner-dish" key={item.id}>
            <span className="owner-dish-icon" aria-hidden="true">{item.emoji}</span><div><h3>{item.name}</h3><p title={item.description}>{item.description || 'No description'}</p><strong>{money(item.unitPriceMinor)}</strong><span className={`availability ${item.available ? '' : 'unavailable'}`}>{item.available ? 'Available' : 'Hidden from ordering'}</span></div>
            <div className="owner-dish-actions"><button disabled={busy} onClick={() => edit(item)}>Edit</button><button disabled={busy || poll.stale} onClick={() => { const { id, ...fields } = item; void write(id, { ...fields, available: !item.available }); }}>{item.available ? 'Hide dish' : 'Make available'}</button></div>
          </article>)}{!loading && !visible.length && !poll.error && <p className={styles.empty}>{items.length ? 'No dishes match this view.' : 'No dishes yet. Add your first dish using the form.'}</p>}</div>
        </section>
        <form className={`dish-form ${styles.panel} ${styles.dishForm}`} onSubmit={save}><p className="kicker">{editing ? 'Edit dish' : 'New dish'}</p><h2>{editing ? 'Update your dish' : 'Add to the menu'}</h2>
          <label htmlFor="dish-name">Dish name</label><input id="dish-name" required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
          <label htmlFor="dish-description">Description</label><textarea id="dish-description" maxLength={500} rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
          <div className="dish-form-row"><div><label htmlFor="dish-icon">Icon</label><input id="dish-icon" required maxLength={24} value={draft.emoji} onChange={event => setDraft({ ...draft, emoji: event.target.value })} /></div>
            <div><label htmlFor="dish-price">Price (₹)</label><input id="dish-price" required type="number" min="1" max="100000" step="0.01" inputMode="decimal" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></div></div>
          <label className="checkbox-label"><input type="checkbox" checked={draft.available} onChange={event => setDraft({ ...draft, available: event.target.checked })} />Available to order</label>
          <button className="primary-button full" disabled={busy || poll.stale}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add dish'}</button>
          {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setDraft(blank); }}>Cancel editing</button>}
          <details><summary>About availability & prices</summary><p>Hiding a dish stops new additions. Price changes apply when guests next add or change a dish. Submitted orders keep their saved prices.</p></details>
        </form>
      </div>
    </section>
  </main>;
}
