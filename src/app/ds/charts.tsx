// Graphiques SVG légers et interactifs (survol = mise en avant + valeur). Aucune
// bibliothèque externe : rendu instantané, thème DQP, accessibles au clavier.

import { useMemo, useState, type ReactNode } from 'react';
import { formatNumber } from '../../core/format';
import { cx } from './primitives';

export const SERIES = ['#2f7cf6', '#2dd4ef', '#8b7cf6', '#22c55e', '#f5a524', '#ec6aa7', '#5eead4', '#94a3b8', '#60a5fa', '#c084fc', '#fb923c', '#a3e635'];

export interface Datum {
  id: string;
  label: string;
  value: number;
  color?: string;
  sub?: string;
}

/** Anneau de répartition (lots, coûts) avec légende synchronisée. */
export function Donut({ data, size = 150, unit = '', center, onSelect }: { data: Datum[]; size?: number; unit?: string; center?: ReactNode; onSelect?: (d: Datum) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let off = 0;
  const h = data.find((d) => d.id === hover);
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Répartition">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={14} />
        {total > 0 &&
          data.map((d, i) => {
            const len = (Math.max(0, d.value) / total) * c;
            const el = (
              <circle
                key={d.id}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? SERIES[i % SERIES.length]}
                strokeWidth={hover === d.id ? 19 : 14}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-off}
                opacity={hover && hover !== d.id ? 0.35 : 1}
                style={{ transition: 'stroke-width 150ms var(--ease), opacity 150ms var(--ease)', cursor: onSelect ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(d)}
              />
            );
            off += len;
            return el;
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0">
        <div className="flex h-full flex-col items-center justify-center text-center">
          {h ? (
            <>
              <span className="max-w-[100px] truncate text-[10.5px] text-muted">{h.label}</span>
              <span className="text-[14px] font-bold text-fg tabular-nums">{total ? formatNumber((h.value / total) * 100, 1) : 0} %</span>
            </>
          ) : (
            center
          )}
        </div>
      </div>
      </div>
      <ul className="m-0 min-w-0 flex-1 list-none space-y-0.5 p-0">
        {data.map((d, i) => (
          <li key={d.id}>
            <button
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.id)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(d)}
              className={cx('flex w-full items-center gap-2 rounded-[5px] px-1.5 py-[3px] text-left text-[12px] transition-colors', hover === d.id ? 'bg-hover text-fg' : 'text-fg-2')}
            >
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: d.color ?? SERIES[i % SERIES.length] }} />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="tabular-nums text-muted">{total ? formatNumber((d.value / total) * 100, 1) : 0} %</span>
              <span className="w-[92px] text-right tabular-nums text-fg">{formatNumber(d.value, 0)}{unit}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barres horizontales classées (quantités, lots). */
export function BarList({ data, unit = '', format = (v: number) => formatNumber(v, 0), onSelect, max: maxProp }: { data: Datum[]; unit?: string; format?: (v: number) => string; onSelect?: (d: Datum) => void; max?: number }) {
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {data.map((d, i) => (
        <li key={d.id}>
          <button onClick={() => onSelect?.(d)} className="group block w-full rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-hover">
            <div className="mb-1 flex items-baseline gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-fg-2 group-hover:text-fg">{d.label}</span>
              {d.sub && <span className="text-[11px] text-muted">{d.sub}</span>}
              <span className="tabular-nums font-semibold text-fg">{format(d.value)}{unit}</span>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full transition-[width] duration-500 ease-ds" style={{ width: `${(Math.max(0, d.value) / max) * 100}%`, background: d.color ?? SERIES[i % SERIES.length] }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Courbe temporelle avec curseur au survol (évolution du montant estimatif). */
export function LineChart({ points, height = 140, format = (v: number) => formatNumber(v, 0), empty }: { points: { t: number; v: number; label?: string }[]; height?: number; format?: (v: number) => string; empty?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = height;
  const pad = { l: 8, r: 8, t: 14, b: 18 };
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (hi === lo) { hi += 1; lo -= 1; }
    const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const pts = points.map((p) => [x(p.t), y(p.v)] as const);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${d} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
    return { pts, d, area };
  }, [points, H, pad.b, pad.l, pad.r, pad.t]);

  if (!geo) return <div className="flex items-center justify-center text-[12px] text-muted" style={{ height }}>{empty}</div>;
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const xs = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          geo.pts.forEach((p, i) => { if (Math.abs(p[0] - xs) < Math.abs(geo.pts[best][0] - xs)) best = i; });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="dq-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => <line key={k} x1={0} x2={W} y1={H * k} y2={H * k} stroke="var(--line-2)" strokeDasharray="3 4" />)}
        <path d={geo.area} fill="url(#dq-area)" />
        <path d={geo.d} fill="none" stroke="var(--brand-2)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <>
            <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={pad.t} y2={H - pad.b} stroke="var(--cyan)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
            <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r={4} fill="var(--cyan)" stroke="var(--bg)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hp && (
        <div className="anim-fade pointer-events-none absolute top-0 rounded-[6px] border border-line bg-[#0b1426] px-2 py-1 text-[11.5px] shadow-ds-2"
          style={{ left: `${(geo.pts[hover!][0] / W) * 100}%`, transform: 'translateX(-50%)' }}>
          <b className="tabular-nums text-fg">{format(hp.v)}</b>
          <div className="text-muted">{new Date(hp.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}{hp.label ? ` · ${hp.label}` : ''}</div>
        </div>
      )}
    </div>
  );
}
