import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  /** Ventas por día del período (índice 0 = día 1), solo los días transcurridos. */
  dailySales?: string[];
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Alquiler',
  PAYROLL: 'Nómina',
  UTILITIES: 'Servicios',
  SUPPLIES: 'Insumos',
  MARKETING: 'Marketing',
  MAINTENANCE: 'Mantenimiento',
  ADMINISTRATIVE: 'Administrativos',
  TRANSPORT: 'Transporte',
  FUEL: 'Combustible',
  TAXES: 'Impuestos',
  OTHER: 'Otros',
};

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

/** Monto corto para ejes y etiquetas ("$22.769", "$1.2k" no — se usa entero con separador). */
function money(n: number, symbol: string): string {
  return formatBase(Math.round(n), symbol).replace(/[.,]00$/, '');
}

/**
 * Punto de equilibrio, compartido por las 3 verticales (ver src/utils/breakeven.ts en el
 * backend) — solo cambia `fetchUrl`. Es lo que necesitas vender en el mes para no perder ni
 * ganar: veredicto + barra con el marcador del equilibrio, las 5 métricas de la cascada
 * (ventas, CV, %MC, CF, utilidad) y el gráfico de ventas acumuladas contra el equilibrio
 * con la proyección al ritmo actual.
 */
export function BreakEvenCard({ fetchUrl }: { fetchUrl: string }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [data, setData] = useState<BreakEvenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .get(fetchUrl)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el punto de equilibrio.'));
  }, [fetchUrl]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <div className={`${card} h-40 animate-pulse`} />;

  const { breakEven: be, fixedCosts } = data;
  const monthName = new Date(data.period.start).toLocaleDateString('es-VE', { month: 'long' });
  const sales = Number(be.salesBase);
  const breakEven = be.breakEvenBase != null ? Number(be.breakEvenBase) : null;
  const projected = Number(be.projectedBase);
  const gap = be.gapBase != null ? Number(be.gapBase) : null;
  const profitToday = breakEven != null && be.contributionMarginPercent != null
    ? sales * (Number(be.contributionMarginPercent) / 100) - Number(be.fixedCostsBase)
    : null;

  // Barra: la escala va hasta la proyección (o el equilibrio si es mayor), así vendido y
  // marcador caben en la misma regla.
  const barMax = Math.max(projected, breakEven ?? 0, sales, 1);
  const soldPct = Math.min(100, (sales / barMax) * 100);
  const bePct = breakEven != null ? Math.min(100, (breakEven / barMax) * 100) : null;

  const headline =
    breakEven == null
      ? 'Vendiendo a pérdida en promedio: ningún nivel de ventas cubre los costos fijos así.'
      : be.achieved
        ? `Es lo que necesitas vender en el mes para no perder ni ganar. Llevas ${money(sales, symbol)} — ya lo superaste por ${money(-(gap ?? 0), symbol)}.`
        : `Es lo que necesitas vender en el mes para no perder ni ganar. Llevas ${money(sales, symbol)} — te faltan ${money(gap ?? 0, symbol)}.`;

  return (
    <div className="flex flex-col gap-4">
      {/* --- Cabecera + barra --- */}
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-brand-950">Punto de equilibrio de {monthName}</h2>
            <p className="mt-1 max-w-2xl text-[13px] font-light leading-snug text-brand-950/60">{headline}</p>
          </div>
          <p className="text-[12px] font-light text-brand-950/40">
            Día {be.daysElapsed} de {be.daysInPeriod}
          </p>
        </div>

        <div className="relative mt-10 mb-2">
          {bePct != null && (
            <div className="absolute -top-9 z-10 -translate-x-1/2" style={{ left: `${bePct}%` }}>
              <span className="whitespace-nowrap rounded-full bg-brand-950 px-3 py-1 text-[12px] font-bold text-white shadow">
                Equilibrio {money(breakEven!, symbol)}
              </span>
              <div className="mx-auto mt-0.5 h-2 w-2 rounded-full bg-brand-950" />
              <div className="mx-auto h-9 w-0.5 bg-brand-950" />
            </div>
          )}
          <div className="h-8 w-full overflow-hidden rounded-2xl bg-brand-950/[0.05]">
            <div
              className={`h-full rounded-2xl transition-all ${
                breakEven == null
                  ? 'bg-red-500'
                  : be.achieved
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    : 'bg-gradient-to-r from-brand-600 to-brand-400'
              }`}
              style={{ width: `${breakEven == null ? 100 : soldPct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[13px] text-brand-950/60">
          <span>
            Vendido: <span className="font-bold text-brand-950">{money(sales, symbol)}</span>
          </span>
          <span>
            Proyección a fin de mes: <span className="font-bold text-brand-950">{money(projected, symbol)}</span>
          </span>
        </div>
      </div>

      {/* --- Las 5 métricas --- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Ventas del mes" value={money(sales, symbol)} caption={`${be.daysElapsed} días`} />
        <Metric
          label="Costo variable"
          value={money(Number(be.cvBase), symbol)}
          caption={sales > 0 ? `${((Number(be.cvBase) / sales) * 100).toFixed(1).replace('.', ',')}% de las ventas` : 'Sin ventas'}
        />
        <Metric
          label="Margen de contribución"
          value={be.contributionMarginPercent ? `${be.contributionMarginPercent.replace('.', ',')}%` : '—'}
          caption={`${money(Number(be.contributionMarginBase), symbol)} en el mes`}
          highlighted
        />
        <Metric
          label="Costos fijos"
          value={money(Number(be.fixedCostsBase), symbol)}
          caption={
            fixedCosts.byCategory.length > 0
              ? `${fixedCosts.byCategory.length} categoría${fixedCosts.byCategory.length === 1 ? '' : 's'}`
              : 'Sin gastos recurrentes'
          }
        />
        <Metric
          label="Utilidad hoy"
          value={profitToday == null ? '—' : `${profitToday < 0 ? '−' : ''}${money(Math.abs(profitToday), symbol)}`}
          caption={profitToday == null ? 'Sin margen positivo' : profitToday < 0 ? 'Aún bajo el equilibrio' : 'Ya en zona de utilidad'}
          tone={profitToday == null ? undefined : profitToday < 0 ? 'danger' : 'success'}
        />
      </div>

      {/* --- Gráfico acumulado vs equilibrio --- */}
      {data.dailySales && data.dailySales.length > 0 && (
        <div className={`${card} p-5 sm:p-6`}>
          <h3 className="text-[16px] font-bold text-brand-950">Ventas acumuladas contra el equilibrio</h3>
          <p className="mt-0.5 text-[13px] font-light text-brand-950/55">
            Cada día suma a la línea. Donde cruza la línea horizontal, el mes empieza a dejar utilidad.
          </p>
          <CumulativeChart
            dailySales={data.dailySales.map(Number)}
            daysInPeriod={be.daysInPeriod}
            breakEven={breakEven}
            pace={Number(be.paceBase)}
            symbol={symbol}
          />
        </div>
      )}

      {/* --- Detalle del cálculo (plegado) --- */}
      <div>
        <button
          onClick={() => setShowDetail((s) => !s)}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600"
        >
          {showDetail ? 'Ocultar cómo se calcula' : 'Ver cómo se calcula'}
          {showDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showDetail && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className={`${card} space-y-2 p-4`}>
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
                value={breakEven == null ? 'No aplica (%MC ≤ 0)' : formatBase(be.breakEvenBase!, symbol)}
                strong
              />
              <CascadeRow label="Ritmo de ventas (por día)" value={formatBase(be.paceBase, symbol)} />
              <CascadeRow
                label="Utilidad proyectada a fin de mes"
                value={be.projectedProfitBase ? formatBase(be.projectedProfitBase, symbol) : 'No aplica'}
                strong
                tone={be.projectedProfitBase && Number(be.projectedProfitBase) < 0 ? 'danger' : 'success'}
              />
            </div>
            {fixedCosts.byCategory.length > 0 ? (
              <div className={`${card} space-y-2 p-4`}>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-950/40">Costos fijos por categoría</p>
                {fixedCosts.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <span className="font-light text-brand-950/70">{EXPENSE_CATEGORY_LABELS[c.category] ?? c.category}</span>
                    <span className="font-medium text-brand-950">{formatBase(c.amountBase, symbol)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                No tienes gastos marcados como recurrentes — marca tus gastos fijos (alquiler, nómina, servicios) como
                recurrentes en Gastos para que este cálculo sea preciso.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  highlighted,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  highlighted?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className={`${card} p-4 ${highlighted ? '!border-brand-400/60 !bg-brand-500/[0.06]' : ''}`}>
      <p className="text-[13px] font-semibold text-brand-950/55">{label}</p>
      <p
        className={`mt-1.5 text-[26px] font-bold leading-none tracking-tight ${
          tone === 'danger' ? 'text-red-600' : tone === 'success' ? 'text-emerald-600' : highlighted ? 'text-brand-500' : 'text-brand-950'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] font-light text-brand-950/45">{caption}</p>
    </div>
  );
}

/**
 * SVG a mano: ventas acumuladas (sólida), proyección al ritmo actual (punteada), la línea del
 * equilibrio y el día en que se cruza. Escala por viewBox — se adapta al ancho de la tarjeta.
 */
function CumulativeChart({
  dailySales,
  daysInPeriod,
  breakEven,
  pace,
  symbol,
}: {
  dailySales: number[];
  daysInPeriod: number;
  breakEven: number | null;
  pace: number;
  symbol: string;
}) {
  const W = 760;
  const H = 300;
  const padL = 62;
  const padR = 16;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Acumulado real, día a día.
  const cumulative: number[] = [];
  let acc = 0;
  for (const d of dailySales) {
    acc += d;
    cumulative.push(acc);
  }
  const today = dailySales.length;
  const soldToday = cumulative[cumulative.length - 1] ?? 0;
  const projectedEnd = soldToday + pace * (daysInPeriod - today);

  // Techo "limpio" (múltiplo de 1/2/5×10^n) para que los ticks del eje Y salgan redondos.
  const rawMax = Math.max(projectedEnd, breakEven ?? 0, soldToday, 1) * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const niceStep = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s * 4 >= rawMax) ?? magnitude * 10;
  const yMax = niceStep * 4;
  const x = (day: number) => padL + ((day - 1) / Math.max(1, daysInPeriod - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  const realPath = cumulative.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const projPath = `M ${x(today).toFixed(1)} ${y(soldToday).toFixed(1)} L ${x(daysInPeriod).toFixed(1)} ${y(projectedEnd).toFixed(1)}`;

  // Día en que la línea (real o proyectada) cruza el equilibrio.
  let crossDay: number | null = null;
  if (breakEven != null) {
    const realIdx = cumulative.findIndex((v) => v >= breakEven);
    if (realIdx >= 0) crossDay = realIdx + 1;
    else if (pace > 0) {
      const d = today + (breakEven - soldToday) / pace;
      crossDay = d <= daysInPeriod ? d : null;
    }
  }

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);
  const xTicks = [1, 5, 10, 15, 20, 25, daysInPeriod].filter((d, i, a) => d <= daysInPeriod && a.indexOf(d) === i);
  const short = (v: number) =>
    v >= 1000 ? `${symbol}${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace('.', ',')}k` : `${symbol}${Math.round(v)}`;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label="Ventas acumuladas contra el punto de equilibrio">
        {/* Zona de utilidad (sobre el equilibrio) */}
        {breakEven != null && (
          <rect x={padL} y={padT} width={plotW} height={Math.max(0, y(breakEven) - padT)} fill="#10b981" fillOpacity="0.06" />
        )}
        {/* Grilla y eje Y */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#0f172a" strokeOpacity="0.08" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {short(v)}
            </text>
          </g>
        ))}
        {/* Eje X */}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b">
            {d}
          </text>
        ))}
        {/* Hoy */}
        <line x1={x(today)} x2={x(today)} y1={padT} y2={padT + plotH} stroke="#0f172a" strokeOpacity="0.15" />
        <text x={x(today)} y={padT - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">
          hoy
        </text>
        {/* Equilibrio */}
        {breakEven != null && (
          <>
            <line x1={padL} x2={W - padR} y1={y(breakEven)} y2={y(breakEven)} stroke="#0f172a" strokeWidth="2" strokeDasharray="6 5" />
            <text x={W - padR} y={y(breakEven) - 8} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">
              Punto de equilibrio {money(breakEven, symbol)}
            </text>
          </>
        )}
        {/* Proyección */}
        {today < daysInPeriod && (
          <path d={projPath} fill="none" stroke="#3b82f6" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
        )}
        {/* Real */}
        <path d={realPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(today)} cy={y(soldToday)} r="5" fill="#2563eb" />
        {/* Cruce */}
        {crossDay != null && breakEven != null && (
          <>
            <circle cx={x(crossDay)} cy={y(breakEven)} r="5.5" fill="#10b981" />
            <text x={x(crossDay)} y={y(breakEven) + 22} textAnchor="middle" fontSize="12" fontWeight="700" fill="#059669">
              día {Math.ceil(crossDay)}
            </text>
          </>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] font-light text-brand-950/60">
        <Legend color="#2563eb">Ventas reales (día 1–{today})</Legend>
        <Legend color="#3b82f6" dashed>Proyección al ritmo actual</Legend>
        <Legend color="#0f172a" dashed>Punto de equilibrio</Legend>
        <Legend color="#10b981">Zona de utilidad</Legend>
      </div>
    </div>
  );
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-5 rounded"
        style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 9px)` } : { backgroundColor: color }}
      />
      {children}
    </span>
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
      <span className={strong ? 'font-medium text-brand-950' : 'font-light text-brand-950/60'}>{label}</span>
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
