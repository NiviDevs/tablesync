import test from 'node:test';
import assert from 'node:assert/strict';
import { runSplitPaymentSaga } from '../src/saga.js';

test('commits only when all deterministic payments succeed', async () => {
  const saga = await runSplitPaymentSaga({ sagaId: 'saga_success', payments: [{participantId:'maya',amount:440,outcome:'success'},{participantId:'arjun',amount:440,outcome:'success'}] });
  assert.equal(saga.status, 'COMMITTED'); assert.equal(saga.compensations.length, 0);
});
test('compensates prior successful payments after a failure', async () => {
  const saga = await runSplitPaymentSaga({ sagaId: 'saga_failure', payments: [{participantId:'maya',amount:440,outcome:'success'},{participantId:'arjun',amount:440,outcome:'success'},{participantId:'rhea',amount:440,outcome:'failure'}] });
  assert.equal(saga.status, 'FAILED'); assert.equal(saga.compensations.length, 2); assert.deepEqual(saga.compensations.map(item=>item.state), ['REFUNDED','REFUNDED']);
});
test('treats a deterministic timeout as a failed saga and compensates', async () => {
  const saga = await runSplitPaymentSaga({ sagaId: 'saga_timeout', payments: [{participantId:'maya',amount:440,outcome:'success'},{participantId:'rhea',amount:440,outcome:'timeout'}] });
  assert.equal(saga.status, 'FAILED'); assert.equal(saga.attempts[1].states.at(-1), 'TIMED_OUT'); assert.equal(saga.compensations.length, 1);
});
