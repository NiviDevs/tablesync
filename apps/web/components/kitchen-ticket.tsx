import { money, type OrderView, type OrderStatus } from '@/lib/api';
const next: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  CONFIRMED: { status: 'PREPARING', label: 'Start preparing' },
  PREPARING: { status: 'READY', label: 'Mark ready' }, READY: { status: 'SERVED', label: 'Mark served' },
};
export function KitchenTicket({ order, busy, advance }: { order: OrderView; busy: boolean; advance: (status: OrderStatus) => void }) {
  const action = next[order.status];
  return <article className="restaurant-order" data-testid="kitchen-ticket">
    <div className="order-meta"><span>{order.tableCode}</span><small>{order.status}</small></div>
    <div className="order-items">{order.items.map(item => <p key={item.id}><b>{item.quantity}×</b> {item.name}</p>)}</div>
    <div className="order-footer">{action ? <button className="ready-pill" disabled={busy} onClick={() => advance(action.status)}>{action.label}</button> : <span>Served</span>}<strong>{money(order.total.amountMinor)}</strong></div>
  </article>;
}
