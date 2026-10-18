import { api } from './api';
export type MetricValue = { value: number | null; sampleAt: string | null; state: 'fresh' | 'stale' | 'unavailable' };
export type OpsOverview = {
  environment: 'local-minikube' | 'local-compose'; fetchedAt: string;
  services: { name: string; health: MetricValue; requestsPerSecond: MetricValue; p95Seconds: MetricValue; errorFraction: MetricValue }[];
  session: { desiredReplicas: MetricValue; readyReplicas: MetricValue; cpuCores: MetricValue; memoryBytes: MetricValue; activeSeatingSessions: MetricValue };
  grafanaUrl: string;
};
export const loadOverview = (signal: AbortSignal) => api<OpsOverview>('/v1/ops/overview', { signal });
