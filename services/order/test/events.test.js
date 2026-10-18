import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isCommittedPaymentEvent } from '../server.js';
import { processPaymentDelivery } from '../src/consumer.js';

const committed = { id: randomUUID(), version: 2, occurredAt: new Date().toISOString(), correlationId: randomUUID(), type: 'payment.saga_committed.v2',
  data: { checkoutId: randomUUID(), sagaId: randomUUID(), sessionId: randomUUID(), totalAmountMinor: 34000, currency: 'INR' } };
test('accepts v2 minor-unit snapshot events and excludes legacy contracts', () => {
  assert.equal(isCommittedPaymentEvent(committed), true);
  assert.equal(isCommittedPaymentEvent({ ...committed, version: 1, type: 'payment.saga_committed.v1' }), false);
  assert.equal(isCommittedPaymentEvent({ ...committed, data: { ...committed.data, totalAmountMinor: 0 } }), false);
  assert.equal(isCommittedPaymentEvent({ ...committed, data: { ...committed.data, currency: 'USD' } }), false);
});
test('malformed delivery cannot starve the following valid event; retries are bounded', async () => {
  const actions = [];
  const channel = { ack() { actions.push('ack'); }, nack(_message, _all, requeue) { actions.push(`nack:${requeue}`); },
    sendToQueue() { actions.push('retry'); }, async waitForConfirms() {} };
  await processPaymentDelivery({ content: Buffer.from('{') }, { channel, project() { throw new Error('must not run'); } });
  await processPaymentDelivery({ content: Buffer.from(JSON.stringify(committed)) }, { channel, project: async () => {} });
  await processPaymentDelivery({ content: Buffer.from(JSON.stringify(committed)), properties: { headers: { 'x-tablesync-attempt': 3 } } },
    { channel, project: async () => { throw new Error('dependency down'); } });
  assert.deepEqual(actions, ['nack:false', 'ack', 'nack:false']);
});
