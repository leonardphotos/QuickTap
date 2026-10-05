import { TrendingDown, TrendingUp } from 'lucide-react';
import { kpis, type Kpi } from './data';
import { formatBs, formatUsd } from './format';

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const width = 96;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24 shrink-0" aria-hidden="true">
      <polygon points={area} fill={stroke} opacity={0.1} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function KpiCard({ kpi, featured }: { kpi: Kpi; featured: boolean }) {
  const positive = kpi.deltaPct >= 0;
  const value = kpi.format === 'money' ? formatUsd(kpi.valueUsd) : String(kpi.valueUsd);

  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-2xl p-5 shadow-sm ${
        featured ? 'bg-gradient-to-br from-brand-950 to-brand-900 text-white' : 'border border-brand-950/[0.06] bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-medium ${featured ? 'text-white/60' : 'text-muted-foreground'}`}>{kpi.label}</p>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
            positive
              ? featured
                ? 'bg-emerald-400/15 text-emerald-300'
                : 'bg-emerald-100 text-emerald-700'
              : featured
                ? 'bg-amber-400/15 text-amber-300'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {positive ? '+' : ''}
          {kpi.deltaPct.toLocaleString('es-VE')}%
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[28px] font-bold leading-none tracking-tight tabular-nums ${featured ? 'text-white' : 'text-brand-950'}`}>
            {value}
          </p>
          <p className={`mt-2 truncate text-xs ${featured ? 'text-white/50' : 'text-brand-950/45'}`}>
            {kpi.format === 'money' ? `${formatBs(kpi.valueUsd)} · ` : ''}
            {kpi.hint}
          </p>
        </div>
        <Sparkline values={kpi.trend} stroke={featured ? '#7dd3fc' : positive ? 'var(--color-brand-500)' : '#f59e0b'} />
      </div>
    </div>
  );
}

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, i) => (
        <KpiCard key={kpi.id} kpi={kpi} featured={i === 0} />
      ))}
    </div>
  );
}
