import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';

interface BreakEvenResult {
  salesBase: string;
  cvBase: string;
  contributionMarginBase: string;
  contributionMarginPercent: string | null;
  fixedCostsBase: string;
  breakEvenBase: string | null;
  gapBase: string | null;
  achieved: boolean;
  daysElapsed: number;
  daysInPeriod: number;
  paceBase: string;
  projectedBase: string;
  projectedProfitBase: string | null;
  onTrackToBreakEven: boolean;
}

interface FixedCostCategory {
  category: string;
  amountBase: string;
}

interface BreakEvenResponse {
  period: { label: string; start: string; end: string };
  fixedCosts: { totalBase: string; byCategory: FixedCostCategory[] };
  breakEven: BreakEvenResult;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Alquiler',
  PAYROLL: 'Nómina',
  UTILITIES: 'Servicios',
  SUPPLIES: 'Insumos',
  MARKETING: 'Marketing',
  MAINTENANCE: 'Mantenimiento',
  TAXES: 'Impuestos',
  OTHER: 'Otros',
};

/**
 * Punto de equilibrio, compartido por las 3 verticales (ver src/utils/breakeven.ts en el
 * backend) — solo cambia `fetchUrl`. Colapsada por defecto: título + veredicto + barra de
 * progreso. "Ver más" expande la cascada completa (ventas, CV, %MC, CF, proyección).
 */
export function BreakEvenCard({ fetchUrl }: { fetchUrl: string }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [data, setData] = useState<BreakEvenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .get(fetchUrl)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el punto de equilibrio.'));
  }, [fetchUrl]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) {
    return <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm h-40 animate-pulse" />;
  }

  const { breakEven: be, fixedCosts } = data;
  const monthName = new Date(data.period.start).toLocaleDateString('es-VE', { month: 'long' });
  const noBreakEven = be.breakEvenBase === null;
  const progressPercent = noBreakEven
    ? 0
    : Math.min(100, Math.round((Number(be.salesBase) / Number(be.breakEvenBase)) * 100));

  const verdict = be.achieved
    ? { text: 'Ya cubriste tus costos fijos este período.', tone: 'success' as const, Icon: CheckCircle2 }
    : noBreakEven
      ? { text: 'Vendiendo a pérdida en promedio: ningún nivel de ventas cubre los costos fijos así.', tone: 'danger' as const, Icon: AlertTriangle }
      : be.onTrackToBreakEven
        ? { text: 'Al ritmo actual, vas a cruzar el punto de equilibrio antes de fin de período.', tone: 'success' as const, Icon: TrendingUp }
        : { text: 'Al ritmo actual, no vas a llegar al punto de equilibrio este período.', tone: 'danger' as const, Icon: TrendingDown };

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-950">Punto de equilibrio de {monthName}</h2>
            <p className="text-xs text-brand-950/40 font-light mt-0.5">
              Día {be.daysElapsed} de {be.daysInPeriod} del período
            </p>
          </div>
          {!noBreakEven && (
            <div className="text-right shrink-0">
              <p className="text-xs text-brand-950/50 font-medium uppercase tracking-wide">Punto de equilibrio</p>
              <p className="text-xl font-semibold text-brand-950">{formatBase(be.breakEvenBase!, symbol)}</p>
            </div>
          )}
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 ${
            verdict.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <verdict.Icon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm font-medium leading-snug">{verdict.text}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-brand-950/50">
            <span>Ventas: {formatBase(be.salesBase, symbol)}</span>
            {!noBreakEven && <span>{progressPercent}%</span>}
          </div>
          <div className="h-2.5 w-full rounded-full bg-brand-950/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${be.achieved ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{ width: `${noBreakEven ? 100 : progressPercent}%`, ...(noBreakEven ? { backgroundColor: '#dc2626' } : {}) }}
            />
          </div>
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-brand-950/[0.06] p-5 space-y-5 bg-brand-950/[0.015]">
          <div className="grid sm:grid-cols-4 gap-3">
            <MiniMetric icon={Wallet} label="Ventas" value={formatBase(be.salesBase, symbol)} />
            <MiniMetric icon={Receipt} label="Costo variable" value={formatBase(be.cvBase, symbol)} />
            <MiniMetric
              icon={TrendingUp}
              label="Margen de contribución"
              value={formatBase(be.contributionMarginBase, symbol)}
              caption={be.contributionMarginPercent ? `${be.contributionMarginPercent}% MC` : 'Sin ventas'}
            />
            <MiniMetric icon={Receipt} label="Costos fijos" value={formatBase(be.fixedCostsBase, symbol)} />
          </div>

          <div className="rounded-xl bg-white border border-brand-950/10 p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-950/40">Cómo se calcula</p>
            <CascadeRow label="Ventas del período" value={formatBase(be.salesBase, symbol)} />
            <CascadeRow label="− Costo variable de lo vendido" value={formatBase(be.cvBase, symbol)} />
            <CascadeRow
              label="= Margen de contribución"
              value={`${formatBase(be.contributionMarginBase, symbol)}${be.contributionMarginPercent ? ` (${be.contributionMarginPercent}%)` : ''}`}
              strong
            />
            <CascadeRow label="Costos fijos del período (gastos recurrentes)" value={formatBase(be.fixedCostsBase, symbol)} />
            <CascadeRow
              label="Punto de equilibrio = CF ÷ %MC"
              value={noBreakEven ? 'No aplica (%MC ≤ 0)' : formatBase(be.breakEvenBase!, symbol)}
              strong
            />
          </div>

          {fixedCosts.byCategory.length > 0 ? (
            <div className="rounded-xl bg-white border border-brand-950/10 p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-950/40">Costos fijos por categoría</p>
              {fixedCosts.byCategory.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="text-brand-950/70 font-light">{EXPENSE_CATEGORY_LABELS[c.category] ?? c.category}</span>
                  <span className="font-medium text-brand-950">{formatBase(c.amountBase, symbol)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3 font-medium">
              No tienes gastos marcados como recurrentes — marca tus gastos fijos (alquiler, nómina, servicios) como
              recurrentes en Gastos para que este cálculo sea preciso.
            </p>
          )}

          <div className="rounded-xl bg-white border border-brand-950/10 p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-950/40">Proyección a fin de período</p>
            <CascadeRow label="Ritmo de ventas (por día)" value={formatBase(be.paceBase, symbol)} />
            <CascadeRow label="Ventas proyectadas a fin de período" value={formatBase(be.projectedBase, symbol)} />
            <CascadeRow
              label="Utilidad proyectada"
              value={be.projectedProfitBase ? formatBase(be.projectedProfitBase, symbol) : 'No aplica (%MC ≤ 0)'}
              strong
              tone={be.projectedProfitBase && Number(be.projectedProfitBase) < 0 ? 'danger' : 'success'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value, caption }: { icon: typeof Wallet; label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl bg-white border border-brand-950/10 p-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-brand-950/40" />
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/50">{label}</p>
      </div>
      <p className="text-base font-semibold text-brand-950">{value}</p>
      {caption && <p className="text-xs text-brand-950/40 font-light mt-0.5">{caption}</p>}
    </div>
  );
}

function CascadeRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={strong ? 'font-medium text-brand-950' : 'text-brand-950/60 font-light'}>{label}</span>
      <span
        className={`shrink-0 ${
          strong
            ? tone === 'danger'
              ? 'font-semibold text-red-600'
              : tone === 'success'
                ? 'font-semibold text-emerald-600'
                : 'font-semibold text-brand-950'
            : 'text-brand-950/80'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
