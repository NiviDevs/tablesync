import type { MetricHistory, MetricValue, OpsOverview } from './ops';

export type ScenarioPod = { name: string; service: string; createdAt: number; readyAt: number };
export type ScenarioLog = { id: string; at: number; service: string; level: 'INFO' | 'WARN'; message: string };
export type Simulation = {
  overview: OpsOverview; at: number; target: number; offered: number; until: number;
  requests: number; payments: number; scalingSince: number; nextPod: number;
  pods: ScenarioPod[]; logs: ScenarioLog[];
};
const services = ['api-gateway', 'session', 'order', 'payment'];
const step = 5;
const sample = (value: number, now: number): MetricValue => ({ value, sampleAt: new Date(now).toISOString(), state: 'fresh' });
const sessions = (pods: ScenarioPod[]) => pods.filter(pod => pod.service === 'session');
const running = (pod: ScenarioPod, now: number) => now >= pod.readyAt;
const wave = (now: number, offset = 0) => 1 + Math.sin(now / 3100 + offset) * .045 + Math.cos(now / 1700 + offset) * .025;

function history(previous: MetricHistory | undefined, at: number, value: number): MetricHistory {
  if (!previous) return Array.from({ length: 181 }, (_, index) => [at - 900 + index * step, value]);
  return [...previous.filter(([time]) => time >= at - 900 && time < at), [at, value]];
}

function overview(offered: number, pods: ScenarioPod[], now: number, previous?: OpsOverview): OpsOverview {
  const ready = sessions(pods).filter(pod => running(pod, now)).length;
  const pressure = offered / (Math.max(1, ready) * 80);
  const error = Math.min(.12, Math.max(0, pressure - 1.8) * .025);
  const latency = (.025 + pressure * .018 + Math.max(0, pressure - .7) ** 2 * .16) * wave(now);
  const at = Math.floor(now / (step * 1000)) * step;
  const currentServices = services.map((name, index) => ({
    name, health: sample(1, now),
    requestsPerSecond: sample((offered * [1, 1, .42, .16][index] + [2, 1.5, .8, .2][index]) * wave(now, index), now),
    p95Seconds: sample(latency * [1.18, 1, 1.42, 2.1][index], now),
    errorFraction: sample(error * [1, 1, .6, .3][index], now),
  }));
  const session = {
    desiredReplicas: sample(sessions(pods).length, now), readyReplicas: sample(ready, now),
    cpuCores: sample((.018 * ready + offered * .00065) * wave(now, 1), now),
    memoryBytes: sample((80 * ready + offered * .08 + 16) * 1048576 * wave(now, 2), now),
    activeSeatingSessions: sample(Math.min(36, 8 + Math.floor(offered * .06)), now),
  };
  return {
    environment: 'simulation', fetchedAt: new Date(now).toISOString(), services: currentServices, session, grafanaUrl: '',
    history: {
      start: at - 900, end: at, step,
      services: currentServices.map((service, index) => ({ name: service.name,
        requestsPerSecond: history(previous?.history.services[index].requestsPerSecond, at, service.requestsPerSecond.value!),
        p95Seconds: history(previous?.history.services[index].p95Seconds, at, service.p95Seconds.value!),
        errorFraction: history(previous?.history.services[index].errorFraction, at, service.errorFraction.value!),
      })),
      session: {
        desiredReplicas: history(previous?.history.session.desiredReplicas, at, session.desiredReplicas.value!),
        readyReplicas: history(previous?.history.session.readyReplicas, at, session.readyReplicas.value!),
        cpuCores: history(previous?.history.session.cpuCores, at, session.cpuCores.value!),
        memoryBytes: history(previous?.history.session.memoryBytes, at, session.memoryBytes.value!),
      },
    },
  };
}

export function createSimulation(now: number): Simulation {
  const pods = [...services, 'web', 'postgres', 'redis', 'rabbitmq', 'prometheus', 'grafana'].map((service, index) => ({
    name: `${service}-7c9d8f6-${String(index + 1).padStart(4, '0')}`, service, createdAt: now - 120000, readyAt: now - 120000,
  }));
  return { overview: overview(0, pods, now), at: now, target: 0, offered: 0, until: 0, requests: 0, payments: 0,
    scalingSince: now, nextPod: 11, pods,
    logs: [{ id: `${now}-start`, at: now, service: 'controller', level: 'INFO', message: 'Simulation initialized · 10 pods ready · awaiting workload' }],
  };
}

export function applySimulationLoad(state: Simulation, rate: number, seconds: number, now: number): Simulation {
  if (!Number.isFinite(rate) || rate < 0 || rate > 400 || ![30, 60, 120].includes(seconds)) throw new Error('Invalid scenario load');
  return { ...state, target: rate, until: rate ? now + seconds * 1000 : 0,
    logs: [{ id: `${now}-load`, at: now, service: 'controller', level: 'INFO' as const,
      message: rate ? `Workload applied · target=${rate} req/s · duration=${seconds}s` : 'Workload stopped · draining requests and observing cooldown' }, ...state.logs].slice(0, 160) };
}

export function advanceSimulation(state: Simulation, now: number): Simulation {
  if (now <= state.at) return state;
  const elapsed = Math.min(5, (now - state.at) / 1000);
  const target = state.until && now >= state.until ? 0 : state.target;
  const offered = state.offered + (target - state.offered) * (1 - Math.exp(-elapsed / 4));
  let pods = [...state.pods], scalingSince = state.scalingSince, nextPod = state.nextPod;
  const logs: ScenarioLog[] = [];
  const log = (service: string, message: string, level: 'INFO' | 'WARN' = 'INFO') => logs.push({ id: `${now}-${logs.length}`, at: now, service, level, message });
  if (target === 0 && state.target > 0) log('controller', 'Workload duration completed · entering cooldown');
  for (const pod of pods) if (pod.readyAt > state.at && pod.readyAt <= now) log('scheduler', `${pod.name} · readiness probe passed · Running`);
  const desired = Math.max(1, Math.min(3, Math.ceil((.018 + offered * .00065) / .06)));
  const current = sessions(pods).length;
  if (desired === current) scalingSince = now;
  else if (now - scalingSince >= (desired > current ? 6000 : 20000)) {
    if (desired > current) {
      const name = `session-7c9d8f6-${String(nextPod++).padStart(4, '0')}`;
      pods.push({ name, service: 'session', createdAt: now, readyAt: now + 6000 });
      log('autoscaler', `Session desired replicas ${current} → ${current + 1} · CPU target=60%`);
      log('scheduler', `${name} · Scheduled · pulling image and starting container`);
    } else {
      const pod = sessions(pods).at(-1)!;
      pods = pods.filter(item => item !== pod);
      log('autoscaler', `Session desired replicas ${current} → ${current - 1} · cooldown complete`);
      log('scheduler', `${pod.name} · connections drained · pod terminated`);
    }
    scalingSince = now;
  }
  const next = overview(offered, pods, now, state.overview);
  const latencyMs = next.services[1].p95Seconds.value! * 1000;
  const failed = next.services[1].errorFraction.value!;
  const requests = state.requests + offered * elapsed;
  const payments = state.payments + offered * .16 * elapsed;
  if (offered >= 1) {
    const trace = `sc-${Math.floor(requests).toString(16).padStart(8, '0')}`;
    log('api-gateway', `GET /v1/tables/SAGE-12 · ${failed > .02 ? 503 : 200} · ${(latencyMs * .7).toFixed(1)}ms · trace=${trace}`, failed > .02 ? 'WARN' : 'INFO');
    log('session', `table.read · cache=hit · replicas=${next.session.readyReplicas.value} · ${latencyMs.toFixed(1)}ms · trace=${trace}`);
    log('order', `checkout.projected · event=payment.completed · ${(latencyMs * 1.1).toFixed(1)}ms · trace=${trace}`);
    log('payment', `payment.authorized · provider=sandbox · ${(latencyMs * 1.5).toFixed(1)}ms · trace=${trace}`);
  }
  return { ...state, overview: next, at: now, target, offered, requests, payments, pods, scalingSince, nextPod,
    logs: [...logs.reverse(), ...state.logs].slice(0, 160) };
}
