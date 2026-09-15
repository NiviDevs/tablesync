import test from 'node:test';
import assert from 'node:assert/strict';
import { isCommittedPaymentEvent } from '../server.js';

const committed = { id: 'e24c6be5-edca-410b-9b9b-277057b071e4', version: 1, occurredAt: '2026-09-15T00:00:00.000Z', correlationId: 'e24c6be5-edca-410b-9b9b-277057b071e5', type: 'payment.saga_committed.v1', data: { sagaId: 'e24c6be5-edca-410b-9b9b-277057b071e6', sessionId: 'e24c6be5-edca-410b-9b9b-277057b071e7', totalAmount: 340 } };
test('accepts the committed-payment contract required for an order projection', () => assert.equal(isCommittedPaymentEvent(committed), true));
test('rejects incomplete and non-committed payment events', () => {
  assert.equal(isCommittedPaymentEvent({ ...committed, type: 'payment.failed.v1' }), false);
  assert.equal(isCommittedPaymentEvent({ ...committed, data: { ...committed.data, totalAmount: 0 } }), false);
});
