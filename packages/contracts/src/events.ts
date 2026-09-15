export type EventEnvelope<T> = { id: string; version: 1; occurredAt: string; correlationId: string; type: string; data: T };
export type ParticipantJoined = EventEnvelope<{ sessionId: string; participant: { id: string; name: string } }>;
export type CartItemAdded = EventEnvelope<{ sessionId: string; item: { id: string; menuItemId: string; ownerId: string; quantity: number } }>;
export type PaymentSucceeded = EventEnvelope<{ sagaId: string; sessionId: string; participantId: string; intentId: string }>;
export type PaymentFailed = EventEnvelope<{ sagaId: string; participantId: string; reason: "failed" | "timeout" }>;
export type PaymentSagaCommitted = EventEnvelope<{ sagaId: string; sessionId: string; totalAmount: number }>;
export type OrderConfirmed = EventEnvelope<{ orderId: string; sessionId: string; restaurantName: string; totalAmount: number }>;
