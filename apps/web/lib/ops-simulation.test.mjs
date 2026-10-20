import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, applySimulationLoad, advanceSimulation } from './ops-simulation.ts';

const now = 1800000000000;

test('simulation fills metrics, models pending/ready replicas, and drains after load expires', () => {
  const initial = createSimulation(now);
  assert.equal(initial.overview.environment, 'simulation');
  assert.equal(initial.pods.length, 10);
  for (const service of initial.overview.services) for (const key of ['health', 'requestsPerSecond', 'p95Seconds', 'errorFraction']) {
    assert(Number.isFinite(service[key].value));
    assert.equal(service[key].state, 'fresh');
  }
  for (const metric of Object.values(initial.overview.session)) assert(Number.isFinite(metric.value));
  let state = applySimulationLoad(initial, 360, 60, now);
  let peak;
  for (let second = 1; second <= 120; second++) {
    state = advanceSimulation(state, now + second * 1000);
    if (second === 5) peak = state.overview.services[1].p95Seconds.value;
    if (second === 7) {
      assert.equal(state.overview.session.desiredReplicas.value, 2);
      assert.equal(state.overview.session.readyReplicas.value, 1);
    }
    if (second === 20) {
      assert.equal(state.overview.session.readyReplicas.value, 3);
      assert(state.overview.services[1].p95Seconds.value < peak);
    }
  }
  assert.equal(state.target, 0);
  assert(state.offered < 1);
  assert.equal(state.overview.session.desiredReplicas.value, 1);
  assert.equal(state.overview.session.readyReplicas.value, 1);
  assert(state.requests > 10000);
  assert(state.payments > 1000);
  assert(state.logs.some(log => log.service === 'autoscaler'));
  assert.equal(initial.requests, 0);
  assert.equal(initial.pods.length, 10);
  assert.equal(initial.logs.length, 1);
});

test('simulation histories and logs stay bounded, and stopping drains without new target load', () => {
  let state = applySimulationLoad(createSimulation(now), 180, 120, now);
  for (let second = 1; second <= 1000; second++) state = advanceSimulation(state, now + second * 1000);
  assert(state.logs.length <= 160);
  assert.equal(state.overview.history.end - state.overview.history.start, 900);
  for (const series of state.overview.history.services) for (const key of ['requestsPerSecond', 'p95Seconds', 'errorFraction']) {
    assert(series[key].length <= 181);
    assert(series[key].every(([at, value]) => at >= state.overview.history.start && Number.isFinite(value)));
  }
  state = applySimulationLoad(state, 180, 60, state.at);
  state = advanceSimulation(state, state.at + 1000);
  const loaded = state.offered;
  state = applySimulationLoad(state, 0, 60, state.at);
  state = advanceSimulation(state, state.at + 1000);
  assert(state.offered < loaded);
  assert.equal(advanceSimulation(state, state.at), state);
  assert.equal(createSimulation(state.at).requests, 0);
});

test('simulation rejects invalid controls', () => {
  for (const rate of [-1, 401, NaN, Infinity]) assert.throws(() => applySimulationLoad(createSimulation(now), rate, 60, now));
  assert.throws(() => applySimulationLoad(createSimulation(now), 180, 999, now));
});
