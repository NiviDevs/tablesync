"use client";
import { AnimatePresence, useIsPresent, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { money, type CartView, type TableView } from '@/lib/api';

type CartProps = {
  cart: CartView; table: TableView; ownerId: string; disabled: boolean;
  change: (menuItemId: string, quantity: number) => void;
};

export function GuestCart({ cart, ...props }: CartProps) {
  return <m.section layout="position" className="payment-status" initial={{ opacity: .7, y: 8 }} animate={{ opacity: 1, y: 0 }}><div><p className="kicker">Shared table order</p><h2>Table total · {money(cart.total.amountMinor)}</h2></div>
    {cart.items.length === 0 && <p>Add a dish to begin.</p>}
    <AnimatePresence initial={false}>{cart.items.map(item => <CartLine key={item.id} item={item} {...props} />)}</AnimatePresence>
  </m.section>;
}

function CartLine({ item, table, ownerId, disabled, change }: Omit<CartProps, 'cart'> & { item: CartView['items'][number] }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <m.div layout="position" initial={{ opacity: .5, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, borderBottomWidth: 0, transition: { duration: reducedMotion ? 0 : .16 } }} transition={reducedMotion ? { duration: 0 } : undefined} style={{ overflow: 'hidden' }} inert={!present} className="cart-line" data-testid="cart-line">
      <div><strong>{item.quantity}× {item.name}</strong><p>{table.session?.participants.find(p => p.id === item.ownerId)?.name ?? 'Guest'} · {money(item.quantity * item.unitPriceMinor)}</p></div>
      {item.ownerId === ownerId && <div className="table-actions">
        <button disabled={disabled || item.quantity <= 1} aria-label={`Decrease ${item.name}`} onClick={() => change(item.menuItemId, item.quantity - 1)}>−</button>
        <button disabled={disabled || item.quantity >= 20} aria-label={`Increase ${item.name}`} onClick={() => change(item.menuItemId, item.quantity + 1)}>+</button>
        <button disabled={disabled} aria-label={`Remove ${item.name}`} onClick={() => change(item.menuItemId, 0)}>Remove</button>
      </div>}
    </m.div>;
}
