import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Layers, PackageMinus, Scale } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { MetricCard } from '@/components/admin/MetricCard';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año', all: 'Histórico' };

interface CostAnalysis {
  period: { label: string };
  ordersCount: number;
  revenueBase: string;
  theoretical: { costBase: string; foodCostPercent: string | null };
  real: { costBase: string; purchases: number; foodCostPercent: string | null };
  waste: { costBase: string; records: number; percentOfSales: string | null; budgetedPercent: string | null };
  deviation: { amountBase: string; percentOfSales: string | null; direction: 'OVER' | 'UNDER' | 'EVEN' };
  coverage: { revenueWithoutCostBase: string; percentWithoutCost: string | null };
  categories: {
    name: string;
    revenueBase: string;
    costBase: string;
    marginBase: string;
    foodCostPercent: string | null;
    shareOfCostPercent: string | null;
  }[];
  rows: {
    name: string;
    categoryName: string;
    quantity: number;
    revenueBase: string;
    costBase: string;
    marginBase: string;
    foodCostPercent: string | null;
    marginPercent: string | null;
    hasCost: boolean;
  }[];
}

/**
 * Análisis de costo: costo teórico (lo que las recetas dicen que debió costar lo vendido)
 * contra el costo real (compras del período), con la merma registrada explicando parte de la
 * diferencia y el resto marcado como desviación por investigar. Debajo, dónde se concentra
 * el costo: por categoría y producto por producto.
 */
export function CostAnalysisSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<CostAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api
      .get('/accounting/cost-analysis', { params: { range } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el análisis de costo.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const m = (v: string) => formatBase(v, symbol);
  const rows = data ? (showAll ? data.rows : data.rows.slice(0, 10)) : [];
  const noCost = data && Number(data.coverage.percentWithoutCost ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month', 'year', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-sm font-light text-brand-950/40">Calculando…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Scale}
              title="Costo teórico (recetas)"
              value={m(data.theoretical.costBase)}
              caption={data.theoretical.foodCostPercent != null ? `${data.theoretical.foodCostPercent}% food cost` : 'sin costos cargados'}
            />
            <MetricCard
              icon={Layers}
              title="Costo real (compras)"
              value={m(data.real.costBase)}
              caption={`${data.real.purchases} compra${data.real.purchases === 1 ? '' : 's'}${data.real.foodCostPercent != null ? ` · ${data.real.foodCostPercent}% de ventas` : ''}`}
            />
            <MetricCard
              icon={PackageMinus}
              title="Merma registrada"
              value={m(data.waste.costBase)}
              valueTone={Number(data.waste.costBase) > 0 ? 'danger' : undefined}
              caption={
                data.waste.budgetedPercent != null
                  ? `${data.waste.percentOfSales}% de ventas · presupuestado ${data.waste.budgetedPercent}%`
                  : `${data.waste.records} registro${data.waste.records === 1 ? '' : 's'}`
              }
            />
            <MetricCard
              icon={AlertTriangle}
              title="Desviación sin explicar"
              value={m(data.deviation.amountBase)}
              valueTone={data.deviation.direction === 'OVER' ? 'danger' : data.deviation.direction === 'UNDER' ? 'success' : undefined}
              caption={
                data.deviation.direction === 'OVER'
                  ? 'compraste más de lo que consumiste'
                  : data.deviation.direction === 'UNDER'
                    ? 'consumiste inventario que ya tenías'
                    : 'cuadrado'
              }
            />
          </div>

          <div className="rounded-2xl border border-brand-950/10 bg-brand-50/40 px-4 py-3 text-[11px] text-brand-950/60">
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Desviación = costo real − costo teórico − merma. El costo real son las compras del período (base de caja): si compraste
                para la semana que viene, aparece como desviación positiva sin que nada esté mal. Lo que hay que vigilar es una
                desviación alta y sostenida — ahí hay porciones más grandes que la receta, precios desactualizados o merma sin registrar.
              </span>
            </p>
          </div>

          {noCost && (
            <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              El {data.coverage.percentWithoutCost}% de tus ventas ({m(data.coverage.revenueWithoutCostBase)}) viene de productos sin costo
              cargado: su food cost sale en 0 % y el costo teórico está subestimado. Cárgales el costo o su receta.
            </p>
          )}

          {/* --- Por categoría --- */}
          {data.categories.length > 0 && (
            <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-brand-950">Dónde se concentra el costo</p>
              <div className="space-y-2.5">
                {data.categories.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-brand-950/80">
                        {c.name}
                        <span className="ml-1.5 text-xs text-brand-950/40">
                          {c.foodCostPercent != null ? `${c.foodCostPercent}% food cost` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-brand-950">
                        {m(c.costBase)} <span className="text-xs font-normal text-brand-950/40">{c.shareOfCostPercent ?? '0.0'}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-950/[0.06]">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Number(c.shareOfCostPercent ?? 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- Producto por producto --- */}
          <div>
            <p className="mb-3 text-sm font-medium text-brand-950/70">Costo y margen por producto</p>
            <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
              <div className="hidden items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40 sm:flex">
                <span className="flex-1">Producto</span>
                <span className="w-20 text-right">Vendidos</span>
                <span className="w-24 text-right">Ingreso</span>
                <span className="w-24 text-right">Costo</span>
                <span className="w-20 text-right">Food cost</span>
                <span className="w-24 text-right">Margen</span>
              </div>
              <div className="divide-y divide-brand-950/[0.06]">
                {rows.length === 0 && <p className="p-5 text-sm font-light text-brand-950/40">Sin ventas en este período.</p>}
                {rows.map((r) => (
                  <div key={`${r.name}-${r.categoryName}`} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-950">
                        {r.name}
                        {!r.hasCost && (
                          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">sin costo</span>
                        )}
                      </p>
                      <p className="text-xs text-brand-950/40">{r.categoryName}</p>
                    </div>
                    <span className="w-20 text-right text-sm text-brand-950/70">{r.quantity}</span>
                    <span className="hidden w-24 text-right text-sm text-brand-950/70 sm:block">{m(r.revenueBase)}</span>
                    <span className="w-24 text-right text-sm text-brand-950/70">{m(r.costBase)}</span>
                    <span
                      className={`w-20 text-right text-sm font-semibold ${
                        !r.hasCost
                          ? 'text-brand-950/30'
                          : Number(r.foodCostPercent ?? 0) <= 35
                            ? 'text-emerald-600'
                            : Number(r.foodCostPercent ?? 0) <= 45
                              ? 'text-amber-600'
                              : 'text-red-600'
                      }`}
                    >
                      {r.hasCost && r.foodCostPercent != null ? `${r.foodCostPercent}%` : '—'}
                    </span>
                    <span className="hidden w-24 text-right text-sm font-semibold text-emerald-600 sm:block">{m(r.marginBase)}</span>
                  </div>
                ))}
              </div>
            </div>
            {data.rows.length > 10 && (
              <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-brand-500 hover:underline">
                {showAll ? 'Ver menos' : `Ver todos (${data.rows.length} productos)`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
