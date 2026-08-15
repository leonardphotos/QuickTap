import { useEffect, useState } from 'react';
import { Building2, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { MetricCard } from '@/components/admin/MetricCard';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

interface BranchComparisonRow {
  branchId: string;
  name: string;
  isMain: boolean;
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  avgTicketBase: string;
  costBase: string;
  marginBase: string;
  marginPercent: string;
  expensesBase: string;
  expensesCount: number;
  netBase: string;
  sharePercent: string;
}

interface BranchComparison {
  businessType: string;
  branches: BranchComparisonRow[];
  totals: {
    branchCount: number;
    ordersCount: number;
    totalBase: string;
    totalBs: string;
    avgTicketBase: string;
    costBase: string;
    marginBase: string;
    expensesBase: string;
    netBase: string;
  };
}

type MetricKey = 'totalBase' | 'avgTicketBase' | 'marginBase' | 'expensesBase' | 'netBase';
const METRICS: { key: MetricKey; label: string; hint: string }[] = [
  { key: 'totalBase', label: 'Ventas', hint: 'lo cobrado en el período' },
  { key: 'avgTicketBase', label: 'Ticket promedio', hint: 'venta ÷ pedidos' },
  { key: 'marginBase', label: 'Utilidad bruta', hint: 'ventas − costo de lo vendido' },
  { key: 'expensesBase', label: 'Gastos', hint: 'egresos registrados en la sede' },
  { key: 'netBase', label: 'Utilidad neta', hint: 'utilidad bruta − gastos' },
];

/**
 * Comparativa administrativa entre sedes: pone a la sede principal y a cada sucursal lado a
 * lado en el mismo período — ventas, pedidos, ticket promedio, costo, gastos y utilidad —
 * con una barra por sede sobre la métrica elegida para ver de un vistazo quién rinde y quién
 * se está comiendo la utilidad. Gastos siempre resta, así que en "Gastos" la barra más larga
 * es la peor: se pinta en rojo para no leerla al revés.
 */
export function BranchComparisonSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metric, setMetric] = useState<MetricKey>('totalBase');
  const [data, setData] = useState<BranchComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/branches/reports/comparison', { params: { range, from: from || undefined, to: to || undefined } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la comparativa.'));
  }, [range, from, to]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const rows = data?.branches ?? [];
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const lowerIsBetter = metric === 'expensesBase';
  const values = rows.map((r) => Number(r[metric]));
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const best = rows.length
    ? rows.reduce((a, b) => (lowerIsBetter ? (Number(a[metric]) <= Number(b[metric]) ? a : b) : Number(a[metric]) >= Number(b[metric]) ? a : b))
    : null;
  const worst = rows.length
    ? rows.reduce((a, b) => (lowerIsBetter ? (Number(a[metric]) >= Number(b[metric]) ? a : b) : Number(a[metric]) <= Number(b[metric]) ? a : b))
    : null;
  const periodLabel = from || to ? 'período elegido' : RANGE_LABELS[range].toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
              setFrom('');
              setTo('');
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              !from && !to && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              from || to ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              from || to ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="text-xs font-medium text-brand-950/50 underline"
          >
            Limpiar fechas
          </button>
        )}
      </div>

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Building2}
            title="Ventas del grupo"
            value={formatBase(data.totals.totalBase, symbol)}
            caption={`${formatBsAbsolute(data.totals.totalBs)} · ${data.totals.branchCount} sede${data.totals.branchCount === 1 ? '' : 's'}`}
          />
          <MetricCard title="Pedidos" value={String(data.totals.ordersCount)} caption={`Ticket promedio ${formatBase(data.totals.avgTicketBase, symbol)}`} />
          <MetricCard
            title="Gastos del grupo"
            value={formatBase(data.totals.expensesBase, symbol)}
            caption={`Costo de lo vendido ${formatBase(data.totals.costBase, symbol)}`}
          />
          <MetricCard
            title="Utilidad neta"
            value={formatBase(data.totals.netBase, symbol)}
            valueTone={Number(data.totals.netBase) < 0 ? 'danger' : 'success'}
            caption="ventas − costo − gastos"
          />
        </div>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-brand-950/70">Comparar por</p>
            <p className="text-xs font-light text-brand-950/45">{activeMetric.hint}</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full bg-brand-950/[0.05] p-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  metric === m.key ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 && <p className="text-sm font-light text-brand-950/40">Todavía no hay sucursales que comparar.</p>}

        <div className="space-y-3">
          {rows.map((r) => {
            const value = Number(r[metric]);
            const width = Math.max((Math.abs(value) / maxAbs) * 100, value === 0 ? 0 : 2);
            const bad = lowerIsBetter || value < 0;
            return (
              <div key={r.branchId}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-brand-950">
                    {r.name}
                    {r.isMain && <span className="ml-1.5 text-[11px] font-normal text-brand-950/40">Sede principal</span>}
                    {best && r.branchId === best.branchId && rows.length > 1 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <TrendingUp className="h-3 w-3" /> Mejor
                      </span>
                    )}
                    {worst && r.branchId === worst.branchId && rows.length > 1 && worst.branchId !== best?.branchId && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        <TrendingDown className="h-3 w-3" /> Más bajo
                      </span>
                    )}
                  </p>
                  <p className={`text-sm font-semibold ${value < 0 ? 'text-red-600' : 'text-brand-950'}`}>
                    {formatBase(r[metric], symbol)}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-950/[0.06]">
                  <div className={`h-full rounded-full ${bad ? 'bg-red-400' : 'bg-brand-500'}`} style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-xs font-light text-brand-950/45">
                  {r.ordersCount} pedido{r.ordersCount === 1 ? '' : 's'} · ticket {formatBase(r.avgTicketBase, symbol)} ·{' '}
                  {r.sharePercent}% de las ventas del grupo
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-brand-950/10 bg-white shadow-sm">
          <div className="flex min-w-[820px] items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
            <span className="min-w-[200px] flex-1">Sede</span>
            <span className="w-20 shrink-0 text-right">Pedidos</span>
            <span className="w-28 shrink-0 text-right">Ventas</span>
            <span className="w-24 shrink-0 text-right">Ticket</span>
            <span className="w-28 shrink-0 text-right">Costo</span>
            <span className="w-32 shrink-0 text-right">Utilidad bruta</span>
            <span className="w-28 shrink-0 text-right">Gastos</span>
            <span className="w-28 shrink-0 text-right">Utilidad neta</span>
          </div>
          <div className="divide-y divide-brand-950/[0.06]">
            {rows.map((r) => (
              <div key={r.branchId} className="flex min-w-[820px] items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-[200px] flex-1">
                  <span className="block truncate font-medium text-brand-950">{r.name}</span>
                  <span className="block text-xs font-light text-brand-950/40">
                    {r.isMain ? 'Sede principal' : 'Sucursal'} · {r.sharePercent}% del grupo
                  </span>
                </span>
                <span className="w-20 shrink-0 text-right text-brand-950/70">{r.ordersCount}</span>
                <span className="w-28 shrink-0 text-right font-medium text-brand-950">{formatBase(r.totalBase, symbol)}</span>
                <span className="w-24 shrink-0 text-right text-brand-950/70">{formatBase(r.avgTicketBase, symbol)}</span>
                <span className="w-28 shrink-0 text-right text-brand-950/70">{formatBase(r.costBase, symbol)}</span>
                <span className="w-32 shrink-0 text-right text-brand-950/70">
                  {formatBase(r.marginBase, symbol)}{' '}
                  <span className="text-xs text-brand-950/40">{r.marginPercent}%</span>
                </span>
                <span className="w-28 shrink-0 text-right text-brand-950/70">{formatBase(r.expensesBase, symbol)}</span>
                <span className={`w-28 shrink-0 text-right font-semibold ${Number(r.netBase) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatBase(r.netBase, symbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs font-light text-brand-950/45">
        Los gastos son los egresos cargados en cada sede durante {periodLabel}; el costo de lo vendido usa el costo
        actual de cada producto (receta o costo manual), igual que el reporte de Margen de utilidad.
      </p>
    </div>
  );
}
