/** F1 browser contract. Implemented incrementally in P1–P4; amounts are paise. */
export type Money = { amountMinor: number; currency: 'INR' };
export type OrderStatus = 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED';
export type CheckoutStatus = 'PENDING' | 'COMMITTED' | 'FAILED';
export type CartLine = { id: string; ownerId: string; menuItemId: string;
  name: string; quantity: number; unitPriceMinor: number };
export type TableView = { code: string; name: string; restaurantId: string;
  session: null | { id: string; status: 'OPEN' | 'CLOSING' | 'CLOSED'; openedAt: string;
    participants: { id: string; name: string }[] } };
export type CartView = { sessionId: string; revision: number;
  state: 'EDITING' | 'PENDING' | 'COMMITTED' | 'FAILED';
  items: CartLine[]; total: Money };
export type CheckoutView = { id: string; sessionId: string; status: CheckoutStatus;
  paymentSagaId: string | null; orderId: string | null; total: Money; simulated: true };
export type OrderView = { id: string; sessionId: string; restaurantId: string;
  tableCode: string; status: OrderStatus; items: CartLine[]; total: Money; createdAt: string };
export type ApiError = { error: { code: string; message: string }; requestId: string };
