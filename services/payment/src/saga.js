import { randomUUID } from 'node:crypto';

/**
 * Review 1 MockPaymentProvider. Outcomes are supplied by the caller so demo
 * behavior remains reproducible and never represents real-money movement.
 */
export class MockPaymentProvider {
  async charge({ participantId, amount, outcome }) {
    const intentId = `pi_${randomUUID()}`;
    const states = ['PENDING', 'PROCESSING'];
    if (outcome === 'success') return { intentId, participantId, amount, states: [...states, 'SUCCEEDED'] };
    return { intentId, participantId, amount, states: [...states, outcome === 'timeout' ? 'TIMED_OUT' : 'FAILED'] };
  }
  async refund(intent) { return { intentId: intent.intentId, state: 'REFUNDED' }; }
}

export async function runSplitPaymentSaga({ sagaId = `saga_${randomUUID()}`, payments, provider = new MockPaymentProvider() }) {
  const state = { sagaId, status: 'PROCESSING', attempts: [], compensations: [], events: [] };
  for (const payment of payments) {
    const attempt = await provider.charge(payment);
    state.attempts.push(attempt);
    const succeeded = attempt.states.at(-1) === 'SUCCEEDED';
    state.events.push({ type: succeeded ? 'payment.succeeded.v1' : 'payment.failed.v1', data: { sagaId, participantId: payment.participantId, intentId: attempt.intentId, reason: succeeded ? undefined : attempt.states.at(-1).toLowerCase() } });
    if (!succeeded) {
      state.status = 'COMPENSATING';
      state.events.push({ type: 'payment.compensation_started.v1', data: { sagaId, failedIntentId: attempt.intentId } });
      for (const successfulAttempt of state.attempts.filter((entry) => entry.states.at(-1) === 'SUCCEEDED')) {
        const compensation = await provider.refund(successfulAttempt);
        state.compensations.push(compensation);
        state.events.push({ type: 'payment.compensated.v1', data: { sagaId, intentId: compensation.intentId } });
      }
      state.status = 'FAILED';
      return state;
    }
  }
  state.status = 'COMMITTED';
  state.events.push({ type: 'payment.saga_committed.v1', data: { sagaId } });
  return state;
}
