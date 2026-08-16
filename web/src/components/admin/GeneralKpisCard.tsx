import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, DollarSign, Receipt, Target, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { hasFeature } from '@/utils/subscription';

type Range = 'day' | 'week' | 'month' | 'year';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' };
const PREVIOUS_LABELS: Record<Range, string> = {
  day: 'ayer',
  week: 'la semana pasada',
  month: 'el mes pasado',
  year: 'el año pasado',
};

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

/** Recordar si el panel de KPI quedó abierto o cerrado, según lo prefiera el dueño. */
const OPEN_KEY = 'quicktap_kpis_open';

/**
 * KPI del negocio en el Dashboard, justo debajo de "Ventas de hoy": las cinco cifras que
 * se miran a diario — punto de equilibrio, ventas, ticket promedio, utilidad neta y food
 * cost — en fichas grandes de dos columnas, con la variación contra el período anterior.
 * Es desplegable: quien no quiere números al entrar lo deja cerrado y no vuelve a estorbar.
 */
export function GeneralKpisCard() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== 'false');
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<GeneralKpis | null>(null);
  // `error` NO oculta el panel: antes cualquier fallo puntual (red del celular, un timeout)
  // lo desaparecía del Dashboard hasta recargar. Ahora se avisa y se puede reintentar,
  // además de un reintento automático a los 4 segundos.
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Altura real del contenido para poder animar el despliegue: `height: auto` no es
  // animable, así que se mide y se anima hasta ese alto exacto. Un ResizeObserver la
  // mantiene al día cuando cambian los datos (otro período, otra cifra más larga).
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // useLayoutEffect y no useEffect: la primera medición ocurre ANTES de pintar, así el panel
  // abre ya con su alto correcto en vez de "crecer" solo al cargar la pantalla.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data, open]);

  const enabled = hasFeature(restaurant, 'administration');

  useEffect(() => {
    if (!enabled || !open) return;
    // `cancelled` evita que una respuesta lenta de un rango anterior pise a la del rango
    // que el usuario está viendo ahora.
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    api
      .get('/kpis/general', { params: { range } })
      .then((res) => {
        if (cancelled) return;
        setData(res.data.data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.status === 403 ? null : 'No se pudieron cargar los indicadores.');
        // Un solo reintento automático: cubre el bache de red típico del celular sin
        // convertirse en un bucle de peticiones contra el servidor.
        retry = setTimeout(() => setReloadKey((k) => k + 1), 4000);
      });

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [range, enabled, open, reloadKey]);

  function toggle() {
    setOpen((o) => {
      localStorage.setItem(OPEN_KEY, String(!o));
      return !o;
    });
  }

  // Sin plan con Administración el Dashboard sigue como siempre (el panel es de Administración).
  if (!enabled) return null;

  const foodCostNum = data ? Number(data.foodCost.percent) : 0;
  const foodCostTone =
    foodCostNum === 0 ? '' : foodCostNum <= 35 ? 'text-emerald-600' : foodCostNum <= 45 ? 'text-amber-600' : 'text-red-600';
  const netTone = data && Number(data.net.base) < 0 ? 'text-red-600' : 'text-emerald-600';
  const progress = data?.breakEven.progressPercent ? Math.min(100, Number(data.breakEven.progressPercent)) : 0;
  // Hay punto de equilibrio real solo si el objetivo es mayor que cero (hay costos fijos).
  const hasBreakEven = !!data?.breakEven.targetBase && Number(data.breakEven.targetBase) > 0;

  return (
    <div className="w-full rounded-3xl border border-brand-950/10 bg-white shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[17px] font-bold text-brand-950">KPI</span>
          <span className="block truncate text-xs font-light text-brand-950/45">
            {open ? `Comparado con ${PREVIOUS_LABELS[range]}` : 'Ventas, ticket, utilidad, food cost y equilibrio'}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-brand-950/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Despliegue animado: el truco de grid-rows 0fr→1fr anima la altura real del
          contenido sin tener que medirla en JS, y se acompaña de un fade + leve subida.
          `motion-reduce` lo apaga para quien pidió menos animación en su sistema. */}
      <div
        aria-hidden={!open}
        style={{ maxHeight: open ? contentHeight : 0 }}
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          ref={contentRef}
          className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
            open ? 'translate-y-0' : '-translate-y-2'
          }`}
        >
          {data && error && (
            <p className="px-5 pb-2 text-[11px] font-light text-amber-700">
              Mostrando los últimos datos: no se pudo actualizar.
            </p>
          )}

          <div className="flex flex-wrap gap-1 px-5 pb-3">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                  range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/55 hover:bg-brand-950/10'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          {!data && error ? (
            <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
              <p className="text-sm font-light text-brand-950/50">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-full bg-brand-950/[0.06] px-3 py-1 text-xs font-semibold text-brand-950/70 hover:bg-brand-950/10"
              >
                Reintentar
              </button>
            </div>
          ) : !data ? (
            <p className="px-5 pb-5 text-sm font-light text-brand-950/40">Calculando…</p>
          ) : (
            // Dos columnas en celular; en escritorio la tarjeta ahora vive en "Panel de
            // ventas" (ancho completo, reemplaza a "Ventas por hora"), así que se reparte en
            // tres columnas — se lee de corrido, en horizontal, como el resto de esa fila.
            <div className="grid grid-cols-2 border-t border-brand-950/[0.07] lg:grid-cols-3">
              {/* Punto de equilibrio: el anillo dice de un vistazo cuánto se lleva del objetivo. */}
              <KpiCell
                ring={progress}
                label="Equilibrio"
                // Sin costos fijos cargados el objetivo es 0: ahí no hay nada que "cubrir",
                // así que se dice qué falta en vez de cantar un 0% ya cubierto.
                value={hasBreakEven ? `${Math.round(progress)}%` : '—'}
                hint={
                  !hasBreakEven
                    ? 'carga tus gastos fijos'
                    : data.breakEven.achieved
                      ? 'ya cubierto'
                      : `faltan ${formatBase(Math.abs(Number(data.breakEven.gapBase ?? 0)).toFixed(2), symbol)}`
                }
              />
              <KpiCell
                icon={Wallet}
                label="Ventas"
                value={formatBase(data.sales.totalBase, symbol)}
                change={data.sales.changePercent}
              />
              <KpiCell
                icon={Receipt}
                label="Ticket promedio"
                value={formatBase(data.avgTicket.base, symbol)}
                change={data.avgTicket.changePercent}
              />
              <KpiCell icon={Receipt} label="Pedidos" value={String(data.sales.count)} hint="en el período" />
              <KpiCell
                icon={TrendingUp}
                label="Utilidad neta"
                value={formatBase(data.net.base, symbol)}
                valueTone={netTone}
                hint={`gastos ${formatBase(data.net.expensesBase, symbol)}`}
              />
              <KpiCell
                icon={DollarSign}
                label="Food cost"
                value={`${data.foodCost.percent}%`}
                valueTone={foodCostTone}
                hint={`costo ${formatBase(data.foodCost.costBase, symbol)}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ficha de un KPI: icono en círculo (o anillo de progreso) a la izquierda, etiqueta chica y
 * el número grande debajo. Las celdas se separan con líneas, sin bordes por ficha, para que
 * la cuadrícula se lea de corrido como una tabla.
 */
function KpiCell({
  icon: Icon,
  ring,
  label,
  value,
  hint,
  change,
  valueTone = '',
}: {
  icon?: typeof Wallet;
  /** 0-100: dibuja un anillo de progreso en vez del icono. */
  ring?: number;
  label: string;
  value: string;
  hint?: string;
  change?: string | null;
  valueTone?: string;
}) {
  const changeNum = change != null ? Number(change) : null;
  // Números largos (montos de 6+ cifras) se achican en vez de desbordar la tarjeta —
  // siempre se ve completo el valor, nunca cortado.
  const valueSizeClass = value.length > 12 ? 'text-[15px]' : value.length > 9 ? 'text-[18px]' : 'text-[22px]';

  return (
    <div className="flex items-center gap-3 border-b border-brand-950/[0.07] px-4 py-4 [&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
      {ring != null ? (
        <ProgressRing value={ring} />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          {Icon && <Icon className="h-5 w-5" />}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight text-brand-950/60">{label}</p>
        <p className={`${valueSizeClass} font-extrabold leading-tight tracking-tight ${valueTone || 'text-brand-950'}`}>
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {changeNum != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
                changeNum >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {changeNum >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(changeNum)}%
            </span>
          )}
          {hint && <span className="text-[11px] font-light leading-tight text-brand-950/40">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

/** Anillo de progreso (0-100) dibujado con un solo círculo SVG, sin librerías. */
function ProgressRing({ value }: { value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, value));

  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-brand-500/15" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * filled) / 100}
          className="text-brand-500"
        />
      </svg>
      <Target className="absolute h-4 w-4 text-brand-500" />
    </span>
  );
}
