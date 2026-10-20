'use client';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { loadOverview, type MetricValue, type OpsOverview } from '@/lib/ops';
import styles from './ops.module.css';
import LiveCharts from './live-charts';
import ControlDeck, { ScenarioActivity } from './control-deck';
import { advanceSimulation, applySimulationLoad, createSimulation, type Simulation } from '@/lib/ops-simulation';

function sampleState(sample: MetricValue, clock: number) {
  return sample.state === 'fresh' && sample.sampleAt && clock - Date.parse(sample.sampleAt) > 45000 ? 'stale' : sample.state;
}

function Metric({ sample, format, clock }: { sample: MetricValue; format?: (value: number) => string; clock: number }) {
  const state = sampleState(sample, clock);
  return <div className={styles.metric} data-state={state}><strong>{sample.value === null ? '—' : format ? format(sample.value) : sample.value.toLocaleString()}</strong><small>{state === 'fresh' ? 'Updated' : state}{sample.sampleAt && <> · <time dateTime={sample.sampleAt}>{new Date(sample.sampleAt).toLocaleTimeString()}</time></>}</small></div>;
}
const decimal = (value: number) => value.toFixed(2);
const latency = (value: number) => `${(value * 1000).toFixed(1)} ms`;
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
export default function Ops() {
  const [measured, setOverview] = useState<OpsOverview | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const simulated = simulation !== null;
  const overview = simulation?.overview ?? measured;
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (simulated) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    async function refresh() {
      try { const data = await loadOverview(controller.signal); if (!controller.signal.aborted) { setOverview(data); setError(''); } }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Metrics unavailable'); }
      finally { if (!controller.signal.aborted) { setClock(Date.now()); setLoading(false); } }
    }
    void refresh();
    return () => controller.abort();
  }, [revision, simulated]);
  useEffect(() => {
    if (!simulated || !autoRefresh) return;
    const timer = setInterval(() => setSimulation(state => state ? advanceSimulation(state, Date.now()) : null), 1000);
    return () => clearInterval(timer);
  }, [simulated, autoRefresh]);
  // Wait after completion so slow refreshes never overlap.
  useEffect(() => {
    if (simulated || !autoRefresh || loading) return;
    const timer = setTimeout(() => setRevision(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [simulated, autoRefresh, loading, revision]);

  const services = overview?.services ?? [];
  const reporting = services.filter(service => sampleState(service.health, clock) === 'fresh' && service.health.value === 1);
  const needsAttention = (service: OpsOverview['services'][number]) => sampleState(service.health, clock) !== 'fresh' || service.health.value !== 1 ||
    (service.errorFraction.value !== null && service.errorFraction.value > 0) ||
    [service.requestsPerSecond, service.p95Seconds, service.errorFraction].some(sample => sampleState(sample, clock) === 'stale');
  const attentionCount = services.filter(needsAttention).length;
  const visible = services.filter(service => service.name.includes(search.trim().toLowerCase()) && (!attentionOnly || needsAttention(service)));
  const rates = services.map(service => service.requestsPerSecond).filter(sample => sampleState(sample, clock) === 'fresh' && sample.value !== null);
  const totalRate = rates.reduce((sum, sample) => sum + sample.value!, 0);
  const maximumRate = Math.max(1, ...rates.map(sample => sample.value!));
  const fetchedAge = overview ? Math.max(0, Math.floor((clock - Date.parse(overview.fetchedAt)) / 1000)) : 0;
  const compose = overview?.environment === 'local-compose';

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link className={`brand ${styles.brand}`} href="/">table<i>sync</i><span>OPERATIONS</span></Link>
      <Link className={styles.mobileWorkspace} href="/restaurant/sign-in">Switch workspace <span aria-hidden="true">↗</span></Link>
      <p className={styles.navLabel}>Workspace</p>
      <nav aria-label="Operations navigation">
        <a className={styles.activeNav} href="#overview" aria-current="page"><span aria-hidden="true">◈</span> Overview</a>
        <a href="#control-deck"><span aria-hidden="true">☷</span> Control deck</a>
        <a href="#live-metrics"><span aria-hidden="true">∿</span> Live metrics</a>
        <a href="#services"><span aria-hidden="true">≡</span> Services</a>
        <a href="#infrastructure"><span aria-hidden="true">▤</span> Infrastructure</a>
      </nav>
      <div className={styles.sidebarFoot}>{simulated ? 'Simulation telemetry' : 'Prometheus telemetry'}<p>{simulated ? 'Generated workload and infrastructure activity.' : 'Live measurements. A clear view of your services.'}</p><Link href="/restaurant/sign-in">Switch workspace <span aria-hidden="true">↗</span></Link></div>
    </aside>
    <div className={styles.workspace} id="overview">
      <header className={styles.topbar}><span>Workspace <b>/</b> Overview</span><span className={styles.environment}>{simulated ? 'Simulation · Kubernetes' : overview ? compose ? 'Docker Compose' : 'Kubernetes' : 'Connecting…'}</span></header>
      <div className={styles.content}>
        <section className={styles.heading}>
          <div><p className={styles.eyebrow}>Infrastructure & observability</p><h1>System overview<span>.</span></h1><p>Keep a pulse on the services behind every table.</p></div>
          <span className={styles.status} data-state={!simulated && error ? 'error' : !autoRefresh || simulated ? 'paused' : 'live'}><span />{!simulated && error ? 'Refresh failed' : !autoRefresh ? 'Updates paused' : simulated ? 'Simulation running' : 'Auto-refresh on'}</span>
        </section>
        <div className={styles.toolbar}>
          <p>{overview ? <>{simulated ? 'Last generated' : 'Last fetched'} <time dateTime={overview.fetchedAt}>{new Date(overview.fetchedAt).toLocaleTimeString()}</time><span> · {fetchedAge}s ago</span></> : 'Connecting to metrics…'}</p>
          <div><button type="button" aria-pressed={!autoRefresh} onClick={() => setAutoRefresh(value => !value)}>{autoRefresh ? 'Pause updates' : 'Resume updates'}</button><button type="button" className={styles.refreshButton} disabled={loading && !simulated} onClick={() => simulated ? setSimulation(state => state ? advanceSimulation(state, Date.now()) : null) : setRevision(value => value + 1)}><span aria-hidden="true">↻</span> {loading && !simulated ? 'Refreshing…' : 'Refresh now'}</button></div>
        </div>
        <ControlDeck simulation={simulation} onMode={enabled => {
          setSimulation(state => enabled ? state ?? createSimulation(Date.now()) : null);
          setClock(Date.now());
        }} onLoad={(rate, seconds) => {
          const now = Date.now();
          setSimulation(state => applySimulationLoad(state ?? createSimulation(now), rate, seconds, now));
          setAutoRefresh(true); setClock(now);
        }} onReset={() => { setSimulation(createSimulation(Date.now())); setAutoRefresh(true); setClock(Date.now()); }} />
        {!simulated && error && <div className={styles.error} role="alert"><strong>Could not refresh metrics.</strong> {error} {overview ? 'Last received samples remain visible and age normally.' : 'Check operator access or try refreshing again.'} <Link href="/restaurant/sign-in">Operator sign-in</Link></div>}
        {!overview && !error && <div className={styles.loading} role="status">Loading service health and infrastructure metrics…</div>}
        {overview && <>
          <section className={styles.summary} aria-label="System summary">
            <article><p>Sources reporting</p><strong>{reporting.length}<span> / {services.length}</span></strong><small><span className={styles.sourceDot} data-state={attentionCount ? 'warning' : 'healthy'} />{attentionCount ? `${attentionCount} ${attentionCount === 1 ? 'source needs' : 'sources need'} attention` : 'All scrape targets reachable'}</small></article>
            <article><p>Request throughput</p><strong>{rates.length ? decimal(totalRate) : '—'}<span> req/s</span></strong><small>{rates.length} of {services.length} service rates available · {simulated ? 'Generated service traffic' : '1 min window'}</small></article>
            <article><p>Active seatings</p><Metric sample={overview.session.activeSeatingSessions} clock={clock} /><small>Current open table sessions</small></article>
          </section>
          {simulation && <ScenarioActivity simulation={simulation} />}
          <LiveCharts overview={overview} />
          <section className={styles.panel} id="services" aria-labelledby="services-heading">
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Application layer</p><h2 id="services-heading">Service monitor</h2></div><span className={styles.count}>{services.length} services</span></div>
            <div className={styles.filters}><div className={styles.filterButtons} aria-label="Service filters"><button type="button" aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All services <span>{services.length}</span></button><button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>Needs attention <span>{attentionCount}</span></button></div><label className={styles.search}><span className={styles.srOnly}>Search services</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search services…" /></label></div>
            <p className={styles.scrollHint}>Swipe or scroll to view all metrics.</p>
            <div className={styles.tableScroll} role="region" aria-label="Service metrics, scroll horizontally for more columns" tabIndex={0}><table className={styles.table}><caption className={styles.srOnly}>Live application metrics. Select a service to inspect sample times.</caption><thead><tr><th scope="col">Service</th><th scope="col">Scrape status</th><th scope="col">Requests / sec</th><th scope="col">p95 latency</th><th scope="col">5xx errors</th></tr></thead><tbody>
              {visible.map(service => <Fragment key={service.name}><tr>
                <th scope="row"><button type="button" className={styles.serviceButton} aria-expanded={expanded === service.name} aria-controls={`samples-${service.name}`} onClick={() => setExpanded(value => value === service.name ? null : service.name)}><span className={styles.serviceIcon} aria-hidden="true">{service.name.slice(0, 2).toUpperCase()}</span><span>{service.name}<small>Inspect samples <span aria-hidden="true">{expanded === service.name ? '−' : '+'}</span></small></span></button></th>
                <td><div className={styles.health} data-state={sampleState(service.health, clock) === 'fresh' ? service.health.value === 1 ? 'up' : 'down' : sampleState(service.health, clock)}><Metric sample={service.health} clock={clock} format={value => value === 1 ? 'Reachable' : 'Unreachable'} /></div></td>
                <td><Metric sample={service.requestsPerSecond} clock={clock} format={decimal} /><div className={styles.trafficTrack} aria-hidden="true"><span style={{ width: `${sampleState(service.requestsPerSecond, clock) === 'fresh' && service.requestsPerSecond.value !== null ? Math.max(0, service.requestsPerSecond.value) / maximumRate * 100 : 0}%` }} /></div></td>
                <td><Metric sample={service.p95Seconds} clock={clock} format={latency} /></td>
                <td><Metric sample={service.errorFraction} clock={clock} format={percent} /></td>
              </tr><tr id={`samples-${service.name}`} hidden={expanded !== service.name} className={styles.detailRow}><td colSpan={5}><p><strong>{service.name}</strong> · {simulated ? 'Generated scenario samples' : 'Prometheus source samples'}</p><dl className={styles.sampleDetails}>{([
                ['Scrape status', service.health], ['Request rate', service.requestsPerSecond], ['p95 latency', service.p95Seconds], ['5xx errors', service.errorFraction],
              ] as [string, MetricValue][]).map(([label, sample]) => <div key={label}><dt>{label}</dt><dd>{sample.sampleAt ? <time dateTime={sample.sampleAt}>{new Date(sample.sampleAt).toLocaleString()}</time> : 'No sample received'}<span>{sampleState(sample, clock)}</span></dd></div>)}</dl></td></tr></Fragment>)}
              {!visible.length && <tr><td colSpan={5} className={styles.empty}>{search ? 'No services match your search.' : 'No sources need attention.'}<button type="button" onClick={() => { setSearch(''); setAttentionOnly(false); }}>Show all services</button></td></tr>}
            </tbody></table></div>
            <div className={styles.panelFoot}><span>Source: {simulated ? 'simulation' : 'Prometheus'}</span><span>{simulated ? 'Generated service measurements. ' : 'Rates and latency use a 1-minute window. '}Bars compare current service traffic.</span></div>
          </section>
          <section className={styles.panel} id="infrastructure" aria-labelledby="infrastructure-heading">
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Infrastructure layer</p><h2 id="infrastructure-heading">Session deployment</h2></div><span className={styles.count}>{simulated ? 'Simulation' : compose ? 'Compose environment' : 'Kubernetes'}</span></div>
            {compose && <p className={styles.infrastructureNote}>Replica, CPU and memory metrics require Kubernetes. Application metrics above are available in this environment.</p>}
            <div className={styles.resources}>{([
              ['Desired replicas', overview.session.desiredReplicas, undefined], ['Ready replicas', overview.session.readyReplicas, undefined],
              ['CPU usage', overview.session.cpuCores, (value: number) => `${value.toFixed(3)} cores`], ['Memory usage', overview.session.memoryBytes, (value: number) => `${(value / 1048576).toFixed(1)} MiB`],
            ] as [string, MetricValue, ((value: number) => string) | undefined][]).map(([label, sample, format]) => <article key={label}><p>{label}</p><Metric sample={sample} clock={clock} format={format} /></article>)}</div>
            <details className={styles.explanation}><summary>How to read these metrics</summary><p>{simulated ? 'Simulation models request pressure, latency and delayed pod readiness. Replica transitions and resource values are generated locally. Switch to Measured for infrastructure telemetry.' : 'Scrape status measures metrics reachability, not application readiness. Samples older than 45 seconds are stale. Missing sources are unavailable. With no traffic, latency and error fractions can be unavailable. Replica counts come from Kubernetes.'}</p></details>
          </section>
          <footer className={styles.footer}><span>{simulated ? 'Simulation telemetry · generated in this browser.' : 'Measured infrastructure. Source timestamps preserved.'}</span>{overview.grafanaUrl ? <a href={overview.grafanaUrl} target="_blank" rel="noreferrer">Open Grafana <span aria-hidden="true">↗</span></a> : <span>{simulated ? 'Switch to Measured to inspect real telemetry.' : 'Grafana is available in the Kubernetes environment.'}</span>}</footer>
        </>}
      </div>
    </div>
  </main>;
}
