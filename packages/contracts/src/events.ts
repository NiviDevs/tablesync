export type EventEnvelope<T, V extends 1 | 2 = 1> = { id: string; version: V; occurredAt: string; correlationId: string; type: string; data: T };
export type ParticipantJoined = EventEnvelope<{ sessionId: string; participant: { id: string; name: string } }>;
export type CartItemAdded = EventEnvelope<{ sessionId: string; item: { id: string; menuItemId: string; ownerId: string; quantity: number } }>;
export type PaymentSucceeded = EventEnvelope<{ sagaId: string; sessionId: string; participantId: string; intentId: string }>;
export type PaymentFailed = EventEnvelope<{ sagaId: string; participantId: string; reason: "failed" | "timeout" }>;
export type PaymentSagaCommitted = EventEnvelope<{ sagaId: string; sessionId: string; totalAmount: number }>;
export type OrderConfirmed = EventEnvelope<{ orderId: string; sessionId: string; restaurantName: string; totalAmount: number }>;
export type PaymentSagaCommittedV2 = EventEnvelope<{ checkoutId: string; sagaId: string; sessionId: string; totalAmountMinor: number; currency: 'INR' }, 2> & { type: 'payment.saga_committed.v2' };
export type OrderConfirmedV2 = EventEnvelope<{ orderId: string; checkoutId: string; sessionId: string; restaurantId: string; tableCode: string; totalAmountMinor: number; currency: 'INR' }, 2> & { type: 'order.confirmed.v2' };
