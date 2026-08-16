import { useEffect, useState } from 'react';
import { AlertTriangle, PieChart, Target, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { MetricCard } from '@/components/admin/MetricCard';
import { formatBase } from '@/utils/format';

interface StatsRow {
  productId: string;
  name: string;
  categoryName: string;
  salePriceBase: string;
  currentPrice: string;
  priceChanged: boolean;
  materialsCostBase: string;
  totalCostBase: string;
  netProfitBase: string;
  netMarginPercent: string;
  belowTarget: boolean;
  updatedAt: string;
}

interface Stats {
  targetNetMarginPercent: number;
  coverage: { withStructure: number; activeProducts: number };
  averageComposition: { materialsPercent: string | null; variablePercent: string | null; fixedPercent: string | null; profitPercent: string | null };
  period: {
    range: string;
    salesBase: string;
    materialsBase: string;
    variableBase: string;
    fixedBase: string;
    netBase: string;
    materialsPercent: string | null;
    variablePercent: string | null;
    fixedPercent: string | null;
    netPercent: string | null;
    configuredFixedPercent: string;
    configuredVariablePercent: string;
  };
  rows: StatsRow[];
  belowTargetCount: number;
}

type Range = 'week' | 'month' | 'year';
const RANGE_LABEL: Record<Range, string> = { week: 'Esta semana', month: 'Este mes', year: 'Este año' };

/**
 * Estadísticas de estructura de costo: cómo se reparte el precio en promedio entre los
 * productos con ficha guardada, cómo se repartieron de verdad las ventas del período (MP al
 * costo vivo, variables por %, fijos por gastos recurrentes reales) y el ranking de productos
 * por margen neto con los que quedan bajo el objetivo.
 */
export function CostStructureStats({ symbol, onOpenProduct }: { symbol: string; onOpenProduct?: (productId: string) => void }) {
  const [range, setRange] = useState<Range>('month');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyBelow, setOnlyBelow] = useState(false);

  useEffect(() => {
    api
      .get('/cost-structure/stats', { params: { range } })
      .then((res) => setStats(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las estadísticas.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm font-light text-brand-950/40">Calculando…</p>;

  const avg = stats.averageComposition;
  const p = stats.period;
  const rows = onlyBelow ? stats.rows.filter((r) => r.belowTarget) : stats.rows;
  const coveragePct = stats.coverage.activeProducts > 0 ? Math.round((stats.coverage.withStructure / stats.coverage.activeProducts) * 100) : 0;
  const netNegative = Number(p.netBase) < 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['week', 'month', 'year'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Target}
          title="Cobertura"
          value={`${stats.coverage.withStructure} / ${stats.coverage.activeProducts}`}
          caption={`${coveragePct}% de los productos activos con ficha`}
        />
        <MetricCard
          icon={PieChart}
          title="Utilidad neta promedio"
          value={avg.profitPercent != null ? `${avg.profitPercent}%` : '—'}
          valueTone={avg.profitPercent != null ? (Number(avg.profitPercent) >= stats.targetNetMarginPercent ? 'success' : 'danger') : undefined}
          caption={`objetivo ${stats.targetNetMarginPercent}% · sobre fichas guardadas`}
        />
        <MetricCard
          icon={AlertTriangle}
          title="Bajo el objetivo"
          value={String(stats.belowTargetCount)}
          valueTone={stats.belowTargetCount > 0 ? 'danger' : 'success'}
          caption="productos con margen neto menor al objetivo"
        />
        <MetricCard
          icon={Wallet}
          title={`Utilidad neta real · ${RANGE_LABEL[range]}`}
          value={formatBase(p.netBase, symbol)}
          valueTone={netNegative ? 'danger' : 'success'}
          caption={p.netPercent != null ? `${p.netPercent}% de las ventas` : 'sin ventas en el período'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Composición promedio de las fichas */}
        <CompositionCard
          title="Composición promedio por producto"
          hint="Promedio simple de las fichas guardadas: en qué se va cada 100 del precio."
          parts={[
            { label: 'Materia prima', pct: avg.materialsPercent, color: 'bg-sky-400' },
            { label: 'Costos variables', pct: avg.variablePercent, color: 'bg-amber-400' },
            { label: 'Costos fijos', pct: avg.fixedPercent, color: 'bg-rose-400' },
            { label: 'Utilidad neta', pct: avg.profitPercent, color: 'bg-emerald-400' },
          ]}
          empty={stats.coverage.withStructure === 0 ? 'Todavía no hay fichas guardadas: arma la primera en la calculadora.' : null}
        />
        {/* Estructura real del período */}
        <CompositionCard
          title={`Estructura real · ${RANGE_LABEL[range]}`}
          hint="Lo vendido de verdad: MP al costo vivo, variables por % configurado, fijos = gastos recurrentes reales."
          parts={[
            { label: 'Materia prima', pct: p.materialsPercent, color: 'bg-sky-400', amount: formatBase(p.materialsBase, symbol) },
            { label: `Costos variables (${p.configuredVariablePercent}%)`, pct: p.variablePercent, color: 'bg-amber-400', amount: formatBase(p.variableBase, symbol) },
            { label: `Costos fijos reales (config. ${p.configuredFixedPercent}%)`, pct: p.fixedPercent, color: 'bg-rose-400', amount: formatBase(p.fixedBase, symbol) },
            { label: 'Utilidad neta', pct: p.netPercent, color: netNegative ? 'bg-red-500' : 'bg-emerald-400', amount: formatBase(p.netBase, symbol) },
          ]}
          footer={`Ventas del período: ${formatBase(p.salesBase, symbol)}`}
          empty={Number(p.salesBase) <= 0 ? 'Sin ventas en el período.' : null}
        />
      </div>

      {/* Ranking */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-brand-950/70">
            <TrendingUp className="mr-1 inline h-4 w-4 text-brand-500" />
            Productos por margen neto
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-brand-950/60">
            <input type="checkbox" checked={onlyBelow} onChange={(e) => setOnlyBelow(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            Solo bajo el objetivo
          </label>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
          <div className="hidden items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40 sm:flex">
            <span className="flex-1">Producto</span>
            <span className="w-20 text-right">Precio</span>
            <span className="w-24 text-right">Costo total</span>
            <span className="w-24 text-right">Utilidad</span>
            <span className="w-20 text-right">Margen</span>
          </div>
          <div className="divide-y divide-brand-950/[0.06]">
            {rows.length === 0 && (
              <p className="p-5 text-sm font-light text-brand-950/40">
                {onlyBelow ? 'Ningún producto está por debajo del objetivo.' : 'Sin fichas guardadas todavía.'}
              </p>
            )}
            {rows.map((r) => (
              <button
                key={r.productId}
                type="button"
                onClick={() => onOpenProduct?.(r.productId)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-brand-950/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-brand-950">
                    {r.name}
                    {r.belowTarget && (
                      <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">bajo objetivo</span>
                    )}
                    {r.priceChanged && (
                      <span className="ml-2 rounded-full bg-brand-950/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-brand-950/60">
                        precio cambió a {formatBase(r.currentPrice, symbol)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {r.categoryName} · MP {formatBase(r.materialsCostBase, symbol)}
                  </p>
                </div>
                <span className="w-20 text-right text-sm text-brand-950/70">{formatBase(r.salePriceBase, symbol)}</span>
                <span className="hidden w-24 text-right text-sm text-brand-950/70 sm:block">{formatBase(r.totalCostBase, symbol)}</span>
                <span className={`hidden w-24 text-right text-sm font-semibold sm:block ${Number(r.netProfitBase) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatBase(r.netProfitBase, symbol)}
                </span>
                <span className={`w-20 text-right text-sm font-bold ${r.belowTarget ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {r.netMarginPercent}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompositionCard({
  title,
  hint,
  parts,
  footer,
  empty,
}: {
  title: string;
  hint: string;
  parts: { label: string; pct: string | null; color: string; amount?: string }[];
  footer?: string;
  empty: string | null;
}) {
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-brand-950">{title}</p>
      <p className="mb-4 text-xs font-light text-brand-950/50">{hint}</p>
      {empty ? (
        <p className="text-sm font-light text-brand-950/40">{empty}</p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-brand-950/[0.06]">
            {parts.map((pt) => (
              <div key={pt.label} className={pt.color} style={{ width: `${Math.max(0, Math.min(100, Number(pt.pct ?? 0)))}%` }} title={pt.label} />
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {parts.map((pt) => (
              <div key={pt.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-brand-950/80">
                  <span className={`h-2 w-2 rounded-full ${pt.color}`} />
                  {pt.label}
                </span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {pt.amount && <span className="text-xs text-brand-950/50">{pt.amount}</span>}
                  <span className="w-14 text-right font-semibold text-brand-950">{pt.pct != null ? `${pt.pct}%` : '—'}</span>
                </span>
              </div>
            ))}
          </div>
          {footer && <p className="mt-3 text-xs text-brand-950/50">{footer}</p>}
        </>
      )}
    </div>
  );
}
