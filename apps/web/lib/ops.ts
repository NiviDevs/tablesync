import { api } from './api';
export type MetricValue = { value: number | null; sampleAt: string | null; state: 'fresh' | 'stale' | 'unavailable' };
export type MetricHistory = [number, number | null][] | null;
export type OpsOverview = {
  environment: 'local-minikube' | 'local-compose'; fetchedAt: string;
  services: { name: string; health: MetricValue; requestsPerSecond: MetricValue; p95Seconds: MetricValue; errorFraction: MetricValue }[];
  session: { desiredReplicas: MetricValue; readyReplicas: MetricValue; cpuCores: MetricValue; memoryBytes: MetricValue; activeSeatingSessions: MetricValue };
  grafanaUrl: string;
  history: {
    start: number; end: number; step: number;
    services: { name: string; requestsPerSecond: MetricHistory; p95Seconds: MetricHistory; errorFraction: MetricHistory }[];
    session: { desiredReplicas: MetricHistory; readyReplicas: MetricHistory; cpuCores: MetricHistory; memoryBytes: MetricHistory };
  };
};
export const loadOverview = (signal: AbortSignal) => api<OpsOverview>('/v1/ops/overview', { signal });
