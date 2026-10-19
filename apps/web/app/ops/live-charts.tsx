'use client';
import { useState } from 'react';
import type { MetricHistory, OpsOverview } from '@/lib/ops';
import styles from './ops.module.css';

const colors = ['#3c7250', '#c75b37', '#6476b8', '#a27b26'];
const time = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
type Series = { name: string; points: MetricHistory; color: string };

function Chart({ title, unit, series, start, end, step, format, stepped = false }: {
  title: string; unit: string; series: Series[]; start: number; end: number; step: number;
  format: (value: number) => string; stepped?: boolean;
}) {
  const visible = series.map(item => ({ ...item, unavailable: item.points === null, points: item.points?.filter(([at]) => at >= start && at <= end) ?? [] }));
  const values = visible.flatMap(item => item.points.flatMap(([, value]) => value === null ? [] : [value]));
  const maximum = Math.max(...values, 0) || 1;
  const x = (at: number) => 56 + (at - start) / (end - start) * 526;
  const y = (value: number) => 154 - value / maximum * 128;
  const path = (points: [number, number | null][]) => {
    let previous: number | null = null;
    return points.map(([at, value]) => {
      if (value === null) { previous = null; return ''; }
      const joined = previous !== null && at - previous <= step * 1.5;
      previous = at;
      if (!joined) return `M${x(at)},${y(value)}`;
      return stepped ? `H${x(at)}V${y(value)}` : `L${x(at)},${y(value)}`;
    }).join(' ');
  };
  return <figure className={styles.chart}>
    <figcaption><h3>{title}</h3><span>{unit}</span></figcaption>
    {values.length ? <svg viewBox="0 0 600 184" role="img" aria-label={`${title}, ${time(start)} to ${time(end)}. Peak ${format(maximum)} ${unit}.`}>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="56" x2="582" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#e3e7dc" /><text x="48" y={y(maximum * fraction) + 4} textAnchor="end">{format(maximum * fraction)}</text></g>)}
      {visible.map(item => <g key={item.name} fill={item.color}>
        <path d={path(item.points)} stroke={item.color} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {item.points.map(([at, value]) => value === null ? null : <circle key={at} cx={x(at)} cy={y(value)} r="2.5"><title>{item.name} · {time(at)} · {format(value)} {unit}</title></circle>)}
      </g>)}
      <text x="56" y="178">{time(start)}</text><text x="582" y="178" textAnchor="end">{time(end)}</text>
    </svg> : <div className={styles.chartEmpty}>No measurements in this window.</div>}
    <ul className={styles.legend}>{visible.map(item => {
      const last = item.points.at(-1);
      const value = item.unavailable ? 'Source unavailable' : last && last[1] !== null && end - last[0] <= step * 1.5 ? `${format(last[1])} ${unit}` : 'No recent sample';
      return <li key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{value}</strong></li>;
    })}</ul>
    <details className={styles.chartSamples}><summary>View samples</summary><div tabIndex={0} role="region" aria-label={`${title} samples`}><table><thead><tr><th>Time</th>{visible.map(item => <th key={item.name}>{item.name} ({unit})</th>)}</tr></thead><tbody>
      {Array.from(new Set(visible.flatMap(item => item.points.map(([at]) => at)))).sort((a, b) => b - a).map(at => <tr key={at}><th scope="row">{time(at)}</th>{visible.map(item => { const value = item.points.find(point => point[0] === at)?.[1]; return <td key={item.name}>{value == null ? '—' : format(value)}</td>; })}</tr>)}
    </tbody></table></div></details>
  </figure>;
}

export default function LiveCharts({ overview }: { overview: OpsOverview }) {
  const [minutes, setMinutes] = useState(15);
  const history = overview.history;
  if (!history) return null;
  const start = history.end - minutes * 60;
  const application = (key: 'requestsPerSecond' | 'p95Seconds' | 'errorFraction') => history.services.map((service, index) => ({ name: service.name, points: service[key], color: colors[index % colors.length] }));
  const session = (key: keyof typeof history.session, name: string, color = colors[0]): Series => ({ name, points: history.session[key], color });
  const shared = { start, end: history.end, step: history.step };
  return <section id="live-metrics" aria-labelledby="live-heading" className={styles.liveSection}>
    <div className={styles.liveHeading}><div><p className={styles.eyebrow}>Load & performance</p><h2 id="live-heading">Live metrics</h2></div><div className={styles.filterButtons} aria-label="Graph time window">{[5, 15].map(value => <button type="button" key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} min</button>)}</div></div>
    <p className={styles.historyNote}>Prometheus samples every 15 seconds · Rates use a 1-minute window · Gaps indicate missing data · Window ends {time(history.end)}</p>
    <div className={styles.charts}>
      <Chart {...shared} title="Request throughput" unit="req/s" series={application('requestsPerSecond')} format={value => value.toFixed(1)} />
      <Chart {...shared} title="p95 response time" unit="ms" series={application('p95Seconds')} format={value => (value * 1000).toFixed(1)} />
      <Chart {...shared} title="Server errors" unit="%" series={application('errorFraction')} format={value => (value * 100).toFixed(2)} />
      {overview.environment !== 'local-compose' && <>
        <Chart {...shared} title="Session CPU" unit="cores" series={[session('cpuCores', 'Session')]} format={value => value.toFixed(3)} />
        <Chart {...shared} title="Session memory" unit="MiB" series={[session('memoryBytes', 'Session')]} format={value => (value / 1048576).toFixed(1)} />
        <Chart {...shared} title="Session replicas" unit="replicas" stepped series={[session('desiredReplicas', 'Desired'), session('readyReplicas', 'Ready', colors[1])]} format={value => value.toFixed(0)} />
      </>}
    </div>
  </section>;
}
