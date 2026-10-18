import { money, type CartView, type TableView } from '@/lib/api';

export function GuestCart({ cart, table, ownerId, disabled, change }: {
  cart: CartView; table: TableView; ownerId: string; disabled: boolean;
  change: (menuItemId: string, quantity: number) => void;
}) {
  return <section className="payment-status"><div><p className="kicker">Shared table order</p><h2>Table total · {money(cart.total.amountMinor)}</h2></div>
    {cart.items.length === 0 && <p>Add a dish to begin.</p>}
    {cart.items.map(item => <div className="cart-line" key={item.id} data-testid="cart-line">
      <div><strong>{item.quantity}× {item.name}</strong><p>{table.session?.participants.find(p => p.id === item.ownerId)?.name ?? 'Guest'} · {money(item.quantity * item.unitPriceMinor)}</p></div>
      {item.ownerId === ownerId && <div className="table-actions">
        <button disabled={disabled || item.quantity <= 1} aria-label={`Decrease ${item.name}`} onClick={() => change(item.menuItemId, item.quantity - 1)}>−</button>
        <button disabled={disabled || item.quantity >= 20} aria-label={`Increase ${item.name}`} onClick={() => change(item.menuItemId, item.quantity + 1)}>+</button>
        <button disabled={disabled} aria-label={`Remove ${item.name}`} onClick={() => change(item.menuItemId, 0)}>Remove</button>
      </div>}
    </div>)}
  </section>;
}
