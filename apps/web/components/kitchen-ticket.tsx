"use client";
import * as m from 'motion/react-m';
import { useIsPresent } from 'motion/react';
import { money, type OrderView, type OrderStatus } from '@/lib/api';
import styles from './restaurant-workspace.module.css';
const next: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  CONFIRMED: { status: 'PREPARING', label: 'Start preparing' },
  PREPARING: { status: 'READY', label: 'Mark ready' }, READY: { status: 'SERVED', label: 'Mark served' },
};
export function KitchenTicket({ order, busy, advance }: { order: OrderView; busy: boolean; advance: (status: OrderStatus) => void }) {
  const action = next[order.status];
  const present = useIsPresent();
  return <m.article layout="position" initial={{ opacity: .7, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97, transition: { duration: .15 } }} inert={!present} className="restaurant-order" data-testid="kitchen-ticket">
    <div className="order-meta"><span>{order.tableCode}</span><small>{order.status}</small></div>
    <p className={styles.ticketTime}>#{order.id.slice(0, 6)} · Ordered <time dateTime={order.createdAt} title={new Date(order.createdAt).toLocaleString()}>{Math.max(0, Math.floor((Date.now() - Date.parse(order.createdAt)) / 60000))} min ago</time></p>
    <div className="order-items">{order.items.map(item => <p key={item.id}><b>{item.quantity}×</b> {item.name}</p>)}</div>
    <div className="order-footer">{action ? <button className="ready-pill" disabled={busy} onClick={() => advance(action.status)}>{action.label}</button> : <span>Served</span>}<strong>{money(order.total.amountMinor)}</strong></div>
  </m.article>;
}
