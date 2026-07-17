import { useMemo } from 'react';
import { cn, formatCurrency } from '../lib/utils';

// ============================================================
// Donut chart
// ============================================================
export function Donut({
  data,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eceef2" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * circ;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerValue && <span className="font-display font-800 text-ink-900 text-xl">{centerValue}</span>}
        {centerLabel && <span className="text-[11px] text-ink-500 uppercase tracking-wide">{centerLabel}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Bar chart (vertical)
// ============================================================
export function BarChart({
  data,
  height = 200,
  formatValue = (v) => String(v),
  color = '#1e6091',
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 28);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 group">
            <div className="text-[10px] font-600 text-ink-500 opacity-0 group-hover:opacity-100 transition">
              {formatValue(d.value)}
            </div>
            <div
              className="w-full rounded-t-md transition-all duration-300 hover:opacity-90"
              style={{
                height: Math.max(h, 2),
                backgroundColor: d.color ?? color,
              }}
            />
            <div className="text-[10px] text-ink-500 truncate w-full text-center">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Line / Area chart
// ============================================================
export function AreaChart({
  data,
  height = 200,
  color = '#1e6091',
  formatValue = (v) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const w = 600;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const stepX = iw / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => ({
    x: pad.l + i * stepX,
    y: pad.t + ih - ((d.value - min) / range) * ih,
    ...d,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${path} L ${points[points.length - 1]?.x ?? 0} ${pad.t + ih} L ${points[0]?.x ?? 0} ${pad.t + ih} Z`;
  const gid = useMemo(() => `g-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={pad.l}
            x2={w - pad.r}
            y1={pad.t + ih * g}
            y2={pad.t + ih * g}
            stroke="#eceef2"
            strokeDasharray="3 3"
          />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i} className="group">
            <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="2" />
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-ink-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Horizontal bar list
// ============================================================
export function BarList({
  data,
  formatValue = (v) => String(v),
}: {
  data: { label: string; value: number; color?: string; sub?: string }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-500 text-ink-700 truncate">{d.label}</span>
            <span className="font-600 text-ink-900 tabular-nums">{formatValue(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? '#1e6091' }}
            />
          </div>
          {d.sub && <p className="text-[11px] text-ink-400 mt-0.5">{d.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Sparkline
// ============================================================
export function Sparkline({
  data,
  color = '#1e6091',
  width = 120,
  height = 36,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================================
// Funnel chart
// ============================================================
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const pct = (s.value / max) * 100;
        const conv = i === 0 ? 100 : (s.value / stages[0].value) * 100;
        return (
          <div key={i} className="group">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-500 text-ink-700">{s.label}</span>
              <span className="text-ink-500 text-xs">
                <span className="font-700 text-ink-900">{s.value}</span> · {conv.toFixed(0)}%
              </span>
            </div>
            <div
              className={cn('h-9 rounded-lg flex items-center px-3 text-white text-sm font-600 transition-all')}
              style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: s.color }}
            >
              {formatCurrency(s.value * 0).replace('0', '')}
              <span className="ml-auto opacity-90">{s.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
