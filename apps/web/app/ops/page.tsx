'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadOverview, type MetricValue, type OpsOverview } from '@/lib/ops';

function Metric({ sample, format, clock }: { sample: MetricValue; format?: (value: number) => string; clock: number }) {
  const state = sample.state === 'fresh' && sample.sampleAt && clock - Date.parse(sample.sampleAt) > 45000 ? 'stale' : sample.state;
  return <><strong>{sample.value === null ? '—' : format ? format(sample.value) : sample.value.toLocaleString()}</strong><small className={state === 'fresh' ? '' : 'warning'}>{state}{sample.sampleAt && <> · <time dateTime={sample.sampleAt}>{new Date(sample.sampleAt).toLocaleTimeString()}</time></>}</small></>;
}
const decimal = (value: number) => value.toFixed(2);
export default function Ops() {
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const data = await loadOverview(controller.signal); if (!controller.signal.aborted) { setOverview(data); setError(''); } }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Metrics unavailable'); }
      if (!controller.signal.aborted) { setClock(Date.now()); timer = setTimeout(refresh, 5000); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return <main className="ops"><div className="portal"><nav className="portal-nav"><Link className="brand" href="/">table<i>sync</i> / operations</Link><Link href="/restaurant/sign-in">Operator sign-in</Link></nav>
    <p className="eyebrow" style={{ marginTop: 28 }}>{overview?.environment ?? 'Waiting for environment'} · Prometheus · refresh 5 s</p><h1>System overview</h1>
    <p>Real application and infrastructure samples. Scrape status measures metrics reachability; ready replicas come from Kubernetes.</p>
    {error && <p className="form-error" role="alert">{error}{overview ? ' Last received samples remain visible with their source times.' : ''}</p>}
    {!overview && !error && <p role="status">Loading operator metrics…</p>}
    {overview && <><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left', borderSpacing: '0 18px' }}><caption>Application sources</caption><thead><tr><th>Service</th><th>Scrape status</th><th>Requests/s</th><th>p95 latency</th><th>5xx fraction</th></tr></thead><tbody>{overview.services.map(service => <tr key={service.name}><th scope="row">{service.name}</th><td><Metric sample={service.health} clock={clock} format={v => v === 1 ? 'Reachable' : 'Unreachable'} /></td><td><Metric sample={service.requestsPerSecond} clock={clock} format={decimal} /></td><td><Metric sample={service.p95Seconds} clock={clock} format={v => `${(v * 1000).toFixed(1)} ms`} /></td><td><Metric sample={service.errorFraction} clock={clock} format={v => `${(v * 100).toFixed(2)}%`} /></td></tr>)}</tbody></table></div>
    <h2>Session deployment</h2><section className="stat-grid">{([
      ['Desired replicas', overview.session.desiredReplicas, undefined], ['Ready replicas', overview.session.readyReplicas, undefined],
      ['CPU', overview.session.cpuCores, (v: number) => `${v.toFixed(3)} cores`], ['Memory', overview.session.memoryBytes, (v: number) => `${(v / 1048576).toFixed(1)} MiB`],
      ['Active seating sessions', overview.session.activeSeatingSessions, undefined],
    ] as [string, MetricValue, ((value: number) => string) | undefined][]).map(([label, sample, format]) => <div className="stat" key={label}><span className="eyebrow">{label}</span><Metric sample={sample} clock={clock} format={format} /></div>)}</section>
    <p>Samples older than 45 seconds are stale. Missing sources are unavailable. Zero traffic can leave latency/error fractions unavailable.</p>
    <p><a href={overview.grafanaUrl} target="_blank" rel="noreferrer">Open detailed Grafana dashboards</a> · fetched <time dateTime={overview.fetchedAt}>{new Date(overview.fetchedAt).toLocaleTimeString()}</time></p></>}
  </div></main>;
}
