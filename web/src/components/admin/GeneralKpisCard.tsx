import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Target } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { hasFeature } from '@/utils/subscription';

type Range = 'day' | 'week' | 'month' | 'year';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año' };
const PREVIOUS_LABELS: Record<Range, string> = { day: 'ayer', week: 'la semana pasada', month: 'el mes pasado', year: 'el año pasado' };

interface GeneralKpis {
  range: Range;
  sales: { totalBase: string; count: number; previousTotalBase: string; changePercent: string | null };
  avgTicket: { base: string; previousBase: string; changePercent: string | null };
  net: { base: string; costBase: string; expensesBase: string; marginPercent: string | null };
  foodCost: { percent: string; costBase: string };
  breakEven: {
    targetBase: string | null;
    gapBase: string | null;
    achieved: boolean;
    fixedCostsBase: string;
    progressPercent: string | null;
  };
}

/**
 * Panel general del Dashboard: las cinco cifras que de verdad se miran a diario —ventas,
 * ticket promedio, utilidad neta, food cost y punto de equilibrio—, cada una con su
 * comparación contra el período anterior. Es lo primero que se ve al entrar, para no tener
 * que buscar en Administración qué tal va el negocio.
 */
export function GeneralKpisCard() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<GeneralKpis | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasFeature(restaurant, 'administration')) return;
    api
      .get('/kpis/general', { params: { range } })
      .then((res) => setData(res.data.data))
      .catch(() => setFailed(true));
  }, [range, restaurant]);

  // Sin plan con Administración (o si el endpoint falla) el Dashboard sigue como siempre.
  if (!hasFeature(restaurant, 'administration') || failed) return null;

  const foodCostNum = data ? Number(data.foodCost.percent) : 0;
  const foodCostTone = foodCostNum === 0 ? 'text-brand-950' : foodCostNum <= 35 ? 'text-emerald-600' : foodCostNum <= 45 ? 'text-amber-600' : 'text-red-600';
  const netNegative = data ? Number(data.net.base) < 0 : false;

  return (
    <div className="rounded-3xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-brand-950">¿Cómo va el negocio?</p>
          <p className="text-xs font-light text-brand-950/45">Las cinco cifras que importan, comparadas con {PREVIOUS_LABELS[range]}.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                range === r ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">Calculando…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            title="Ventas"
            value={formatBase(data.sales.totalBase, symbol)}
            caption={`${data.sales.count} ticket${data.sales.count === 1 ? '' : 's'}`}
            change={data.sales.changePercent}
          />
          <Kpi
            title="Ticket promedio"
            value={formatBase(data.avgTicket.base, symbol)}
            caption={`antes ${formatBase(data.avgTicket.previousBase, symbol)}`}
            change={data.avgTicket.changePercent}
          />
          <Kpi
            title="Utilidad neta"
            value={formatBase(data.net.base, symbol)}
            valueClass={netNegative ? 'text-red-600' : 'text-emerald-600'}
            caption={`gastos ${formatBase(data.net.expensesBase, symbol)}${data.net.marginPercent ? ` · ${data.net.marginPercent}%` : ''}`}
          />
          <Kpi
            title="Food cost"
            value={`${data.foodCost.percent}%`}
            valueClass={foodCostTone}
            caption={`costo ${formatBase(data.foodCost.costBase, symbol)}`}
          />
          <BreakEvenKpi data={data} symbol={symbol} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-brand-950/[0.06] pt-3">
        <QuickLink to="/admin/administration">Ver administración</QuickLink>
        <QuickLink to="/admin/table-orders">Órdenes de mesa</QuickLink>
        <QuickLink to="/admin/purchases">Registrar compra</QuickLink>
        <QuickLink to="/admin/inventory">Inventario</QuickLink>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  caption,
  change,
  valueClass = 'text-brand-950',
}: {
  title: string;
  value: string;
  caption?: string;
  change?: string | null;
  valueClass?: string;
}) {
  const changeNum = change != null ? Number(change) : null;
  return (
    <div className="rounded-2xl border border-brand-950/[0.08] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/40">{title}</p>
      <p className={`mt-1 text-xl font-bold leading-tight ${valueClass}`}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {changeNum != null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              changeNum >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {changeNum >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(changeNum)}%
          </span>
        )}
        {caption && <span className="text-[11px] font-light text-brand-950/45">{caption}</span>}
      </div>
    </div>
  );
}

/** El punto de equilibrio no es una cifra suelta: se lee como "cuánto llevo del objetivo". */
function BreakEvenKpi({ data, symbol }: { data: GeneralKpis; symbol: string }) {
  const { breakEven } = data;
  const progress = breakEven.progressPercent ? Math.min(100, Number(breakEven.progressPercent)) : 0;

  return (
    <div className="rounded-2xl border border-brand-950/[0.08] px-4 py-3">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
        <Target className="h-3 w-3" /> Punto de equilibrio
      </p>
      {breakEven.targetBase == null ? (
        <>
          <p className="mt-1 text-xl font-bold leading-tight text-brand-950">—</p>
          <p className="mt-1 text-[11px] font-light text-brand-950/45">Carga costos y precios para calcularlo.</p>
        </>
      ) : (
        <>
          <p className={`mt-1 text-xl font-bold leading-tight ${breakEven.achieved ? 'text-emerald-600' : 'text-brand-950'}`}>
            {breakEven.achieved
              ? '¡Cubierto!'
              : formatBase(Math.abs(Number(breakEven.gapBase ?? 0)).toFixed(2), symbol)}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.07]">
            <div className={`h-full rounded-full ${breakEven.achieved ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] font-light text-brand-950/45">
            {breakEven.achieved ? 'ya cubriste los costos fijos' : `falta para cubrir ${formatBase(breakEven.fixedCostsBase, symbol)}`}
          </p>
        </>
      )}
    </div>
  );
}

function QuickLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full bg-brand-950/[0.05] px-3 py-1.5 text-xs font-semibold text-brand-950/70 transition-colors hover:bg-brand-950/10 hover:text-brand-950"
    >
      {children}
    </Link>
  );
}
