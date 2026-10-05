import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ChevronRight, Clock3, Eye, Gauge, Search, ShieldCheck, Store, TrendingUp, Users, X } from 'lucide-react';
import { masterApi } from '@/api/client';

type Vertical = 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE';

interface Snapshot {
  ahora: string;
  desde: string;
  serie: { t: string; total: number; porVertical: Record<Vertical, number> }[];
  totales: Record<Vertical, { operaciones: number; usd: number }>;
  totalDia: { operaciones: number; usd: number };
  visitantes: {
    total: number;
    porVertical: Record<Vertical, number>;
    porNegocio: { negocio: string; vertical: Vertical; visitantes: number }[];
  };
  ranking: { negocio: string; vertical: Vertical; usd: number; operaciones: number }[];
  ultimos: { vertical: Vertical; negocio: string; detalle: string; monto: number; cuando: string }[];
  operations?: {
    summary: { operating: number; warning: number; critical: number; inactive: number; averageAdoption: number; averageHealth: number };
    restaurants: RestaurantOperation[];
  };
}

type LocalStatus = 'OPERANDO' | 'ATENCION' | 'CRITICO' | 'SIN_ACTIVIDAD';
interface RestaurantOperation {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  branchOf: string | null;
  plan: string | null;
  status: LocalStatus;
  health: number;
  adoption: number;
  activityShare: number;
  activeStaff: number;
  activeRoles: string[];
  publicVisitors: number;
  ordersToday: number;
  salesToday: number;
  orders30d: number;
  openOrders: number;
  delayedOrders: number;
  oldestOpenAt: string | null;
  lowStock: number;
  lastActivityAt: string | null;
  modules: { id: string; label: string; score: number; detalle: string }[];
  alerts: { severity: 'CRITICAL' | 'WARNING' | 'INFO'; message: string }[];
}

interface RestaurantDetail {
  restaurant: { id: string; name: string };
  activeSessions: { role: string }[];
  publicVisitors: number;
  recentEvents: { id: string; title: string; detail: string; amount: number; currency: string; at: string }[];
  lowStock: { id: string; name: string; quantity: number; minimum: number; unit: string }[];
}

/**
 * Un color por vertical, sostenido en toda la pantalla: la línea, el punto de la pestaña y la
 * barra del ranking son el mismo, así no hay que leer la etiqueta para saber de quién se habla.
 * Toda la escala vive en el azul de QuickTap y sus vecinos para distinguir las series sin
 * romper la identidad visual clara del Dashboard Máster.
 */
const AZUL = '#009aff';
const VERTICALES: { id: Vertical; label: string; color: string }[] = [
  { id: 'RESTAURANT', label: 'Restaurantes', color: AZUL },
  { id: 'SHOP', label: 'Locales', color: '#22d3ee' },
  { id: 'SPORTS_CLUB', label: 'Canchas', color: '#5b8cff' },
  { id: 'ADMIN_OFFICE', label: 'Administración', color: '#a78bfa' },
];
const COLOR_DE = (v: Vertical) => VERTICALES.find((x) => x.id === v)!.color;

const REFRESCO_MS = 8000;

const usd = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCorto = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

type Foco = 'TODOS' | Vertical;

/**
 * Estadísticas en vivo de toda la plataforma.
 *
 * La pantalla comparte las superficies claras del resto del Dashboard Máster. La gráfica conserva
 * contraste mediante una grilla azul grisácea, trazos más definidos y relleno al enfocar una serie.
 *
 * Las líneas son ACUMULADAS del día: suben y nunca bajan, como la curva de una sesión de
 * mercado. Un histograma por cubo daría cuatro sierras que suben y bajan según pase o no un
 * pedido, y de ahí no se lee cómo va el día.
 *
 * El gráfico es SVG a mano: son polilíneas sobre una grilla, no amerita sumarle una librería de
 * gráficos al bundle del maestro.
 */
export default function MasterLivePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foco, setFoco] = useState<Foco>('TODOS');
  const [pausado, setPausado] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | LocalStatus>('TODOS');
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantOperation | null>(null);
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Se conserva entre refrescos para que un fallo suelto no borre la gráfica de la pantalla.
  const previo = useRef<Snapshot | null>(null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const res = await masterApi.get('/master/live');
        if (!vivo) return;
        previo.current = res.data.data;
        setData(res.data.data);
        setError(null);
      } catch {
        if (vivo) setError('No se pudieron cargar las estadísticas en vivo. Reintentando…');
      }
    }
    cargar();
    if (pausado) return () => { vivo = false; };
    const id = setInterval(cargar, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [pausado]);

  const d = data ?? previo.current;

  const series = useMemo(
    () => (foco === 'TODOS' ? VERTICALES : VERTICALES.filter((v) => v.id === foco)),
    [foco],
  );

  const restaurantesFiltrados = useMemo(() => {
    const term = busqueda.trim().toLocaleLowerCase('es');
    const priority: Record<LocalStatus, number> = { CRITICO: 0, ATENCION: 1, OPERANDO: 2, SIN_ACTIVIDAD: 3 };
    return (data?.operations?.restaurants ?? [])
      .filter((restaurant) => {
        if (filtroEstado !== 'TODOS' && restaurant.status !== filtroEstado) return false;
        if (!term) return true;
        return `${restaurant.name} ${restaurant.slug} ${restaurant.branchOf ?? ''}`.toLocaleLowerCase('es').includes(term);
      })
      .sort((a, b) => priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, 'es'));
  }, [busqueda, data?.operations?.restaurants, filtroEstado]);

  async function abrirDiagnostico(restaurant: RestaurantOperation) {
    setSelectedRestaurant(restaurant);
    setRestaurantDetail(null);
    setDetailLoading(true);
    try {
      const response = await masterApi.get(`/master/live/restaurants/${restaurant.id}`);
      setRestaurantDetail(response.data.data);
    } finally {
      setDetailLoading(false);
    }
  }

  if (!d) {
    return (
      <Marco>
        <p className={`py-24 text-center text-sm ${error ? 'text-red-600' : 'text-brand-950/40'}`}>{error ?? 'Cargando…'}</p>
      </Marco>
    );
  }

  const serie = d.serie;
  const operations = d.operations ?? {
    summary: { operating: 0, warning: 0, critical: 0, inactive: 0, averageAdoption: 0, averageHealth: 100 },
    restaurants: [],
  };
  const valorEn = (p: (typeof serie)[number]) =>
    foco === 'TODOS' ? Math.max(...VERTICALES.map((v) => p.porVertical[v.id])) : p.porVertical[foco];
  const techo = Math.max(1, ...serie.map(valorEn));

  const W = 1000;
  const H = 300;
  const PAD = 10;
  const xDe = (i: number) => PAD + (i / Math.max(1, serie.length - 1)) * (W - PAD * 2);
  const yDe = (valor: number) => H - (valor / techo) * (H - 24) - 12;
  const lineaDe = (v: Vertical) => serie.map((p, i) => `${xDe(i).toFixed(1)},${yDe(p.porVertical[v]).toFixed(1)}`).join(' ');
  const areaDe = (v: Vertical) =>
    `${PAD},${H} ${lineaDe(v)} ${xDe(serie.length - 1).toFixed(1)},${H}`;

  const punto = cursor != null ? serie[Math.min(Math.max(cursor, 0), serie.length - 1)] : null;
  const totalMostrado = foco === 'TODOS' ? d.totalDia.usd : d.totales[foco].usd;

  return (
    <Marco>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-brand-950">Centro de operaciones</h1>
          <p className="mt-0.5 font-light text-brand-950/45 text-base">
            Lo que está generando la plataforma hoy, desde las {hora(d.desde)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPausado((p) => !p)}
          className="flex items-center gap-2 rounded-full border border-brand-950/10 bg-brand-950/[0.04] px-3.5 py-2 text-xs font-semibold text-brand-950/70 transition-colors hover:bg-brand-950/[0.08]"
        >
          <span
            className={`h-2 w-2 rounded-full ${pausado ? 'bg-brand-950/30' : 'animate-pulse'}`}
            style={pausado ? undefined : { background: AZUL }}
          />
          {pausado ? 'Reanudar' : 'En vivo'}
        </button>
      </div>

      {error && <p className="mt-3 text-amber-700 text-xs">{error}</p>}

      <section className="mt-5 overflow-hidden rounded-[28px] border border-brand-950/[0.07] bg-white shadow-[0_24px_70px_-52px_rgba(0,27,67,0.55)]">
        <div className="border-b border-brand-950/[0.06] bg-[linear-gradient(135deg,rgba(0,154,255,.09),rgba(91,92,255,.04),transparent_70%)] p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-bold uppercase tracking-[0.16em] text-brand-500 text-xs">Centro de operaciones</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-brand-950 sm:text-2xl">Funcionamiento de restaurantes</h2>
              <p className="mt-1 max-w-2xl font-light leading-relaxed text-brand-950/48 text-xs">
                Actividad, adopción y señales operativas por local. Los porcentajes de uso solo consideran las funciones disponibles en cada plan.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Actualización automática
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <OperationSummary label="Saludables" value={operations.summary.operating} tone="green" icon={<ShieldCheck className="h-4 w-4" />} />
            <OperationSummary label="Por vencer" value={operations.summary.warning} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
            <OperationSummary label="No disponibles" value={operations.summary.critical} tone="red" icon={<Activity className="h-4 w-4" />} />
            <OperationSummary label="Sin conexión" value={operations.summary.inactive} tone="slate" icon={<Clock3 className="h-4 w-4" />} />
            <OperationSummary label="Adopción promedio" value={`${operations.summary.averageAdoption}%`} tone="blue" icon={<Gauge className="h-4 w-4" />} wide />
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-sm text-sm font-medium">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/30" />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar restaurante o sede"
                className="h-10 w-full rounded-xl border border-brand-950/10 bg-brand-950/[0.025] pl-10 pr-3 text-brand-950 outline-none transition focus:border-brand-500/45 focus:bg-white focus:ring-4 focus:ring-brand-500/10 text-base"
              />
            </label>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                ['TODOS', 'Todos'], ['OPERANDO', 'Saludables'], ['ATENCION', 'Por vencer'], ['CRITICO', 'No disponibles'], ['SIN_ACTIVIDAD', 'Sin conexión'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltroEstado(id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${filtroEstado === id ? 'bg-brand-500 text-white shadow-sm' : 'bg-brand-950/[0.045] text-brand-950/55 hover:bg-brand-950/[0.08]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-brand-950/[0.07] lg:block">
            <div className="grid grid-cols-[minmax(230px,1.5fr)_130px_135px_120px_130px_minmax(180px,1fr)_36px] gap-3 bg-brand-950/[0.035] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-950/38">
              <span>Restaurante</span><span>Salud del local</span><span>Actividad</span><span>Pedidos</span><span>Uso QuickTap</span><span>Señal de salud</span><span />
            </div>
            <div className="divide-y divide-brand-950/[0.055]">
              {restaurantesFiltrados.map((restaurant) => (
                <button
                  key={restaurant.id}
                  type="button"
                  onClick={() => abrirDiagnostico(restaurant)}
                  className="grid w-full grid-cols-[minmax(230px,1.5fr)_130px_135px_120px_130px_minmax(180px,1fr)_36px] items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-500/[0.035] focus-visible:bg-brand-500/[0.05] focus-visible:outline-none"
                >
                  <RestaurantIdentity restaurant={restaurant} />
                  <StatusBadge status={restaurant.status} />
                  <div>
                    <p className="font-semibold text-brand-950 text-xs">{restaurant.activeStaff + restaurant.publicVisitors} en línea</p>
                    <p className="mt-0.5 text-brand-950/38 text-base">{relativeTime(restaurant.lastActivityAt)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-brand-950 text-xs">{restaurant.openOrders} abiertos</p>
                    <p className={`mt-0.5 text-[10.5px] ${restaurant.delayedOrders ? 'font-semibold text-amber-600' : 'text-brand-950/38'}`}>{restaurant.delayedOrders} demorados</p>
                  </div>
                  <MetricBar value={restaurant.adoption} />
                  <p className={`truncate text-[11.5px] ${restaurant.alerts.length ? 'font-medium text-brand-950/70' : 'text-emerald-600'}`} title={restaurant.alerts[0]?.message}>
                    {restaurant.alerts[0]?.message ?? 'QuickTap disponible'}
                  </p>
                  <ChevronRight className="h-4 w-4 text-brand-950/25" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 lg:hidden">
            {restaurantesFiltrados.map((restaurant) => (
              <button key={restaurant.id} type="button" onClick={() => abrirDiagnostico(restaurant)} className="rounded-2xl border border-brand-950/[0.07] bg-white p-3.5 text-left shadow-[0_12px_32px_-30px_rgba(0,27,67,.5)] transition active:scale-[.99]">
                <div className="flex items-center justify-between gap-3">
                  <RestaurantIdentity restaurant={restaurant} />
                  <StatusBadge status={restaurant.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-brand-950/[0.025] p-2.5">
                  <SmallMetric label="En línea" value={restaurant.activeStaff + restaurant.publicVisitors} />
                  <SmallMetric label="Abiertos" value={restaurant.openOrders} />
                  <SmallMetric label="Uso" value={`${restaurant.adoption}%`} />
                </div>
                <p className={`mt-2.5 truncate text-[11px] ${restaurant.alerts.length ? 'text-brand-950/60' : 'text-emerald-600'}`}>{restaurant.alerts[0]?.message ?? 'QuickTap disponible'}</p>
              </button>
            ))}
          </div>

          {restaurantesFiltrados.length === 0 && <p className="py-12 text-center text-brand-950/35 text-base">No hay restaurantes que coincidan con este filtro.</p>}
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          label="En la página ahora"
          valor={String(d.visitantes.total)}
          pie={d.visitantes.porNegocio[0]?.negocio ?? 'Nadie navegando'}
          icono={<Eye className="h-3.5 w-3.5" />}
          chispa={d.visitantes.porNegocio.map((n) => n.visitantes)}
        />
        <Tarjeta
          label="Operaciones hoy"
          valor={String(d.totalDia.operaciones)}
          pie="Pedidos, ventas y reservas"
          icono={<Activity className="h-3.5 w-3.5" />}
          chispa={serie.map((p) => p.total)}
        />
        <Tarjeta
          label="Generado hoy"
          valor={usdCorto(d.totalDia.usd)}
          pie={usd(d.totalDia.usd)}
          icono={<TrendingUp className="h-3.5 w-3.5" />}
          chispa={serie.map((p) => p.total)}
          destacado
        />
        <Tarjeta
          label="Va ganando"
          valor={d.ranking[0]?.negocio ?? '—'}
          pie={d.ranking[0] ? `${usd(d.ranking[0].usd)} · ${d.ranking[0].operaciones} ops` : 'Sin movimiento todavía'}
          chispa={[...d.ranking].reverse().map((r) => r.usd)}
          compacto
        />
      </div>

      <section className="mt-3 rounded-[24px] border border-brand-950/[0.07] bg-white p-4 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-brand-950 text-base">Generado hoy</p>
          <p className="text-[22px] font-bold tabular-nums" style={{ color: foco === 'TODOS' ? '#001b43' : COLOR_DE(foco) }}>
            {usd(totalMostrado)}
          </p>
        </div>

        {/* Pestañas: "Todos" superpone las cuatro líneas; una sola la dibuja con relleno, que es
            donde se le ve bien la forma a la curva. */}
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['TODOS', ...VERTICALES.map((v) => v.id)] as Foco[]).map((f) => {
            const activo = foco === f;
            const label = f === 'TODOS' ? 'Todos' : VERTICALES.find((v) => v.id === f)!.label;
            const color = f === 'TODOS' ? AZUL : COLOR_DE(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFoco(f)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  activo ? 'text-brand-950' : 'text-brand-950/45 hover:text-brand-950/70'
                }`}
                style={activo ? { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}59` } : undefined}
              >
                {f !== 'TODOS' && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                {label}
                {f !== 'TODOS' && <span className="tabular-nums text-brand-950/45">{usdCorto(d.totales[f].usd)}</span>}
              </button>
            );
          })}
        </div>

        <div className="relative mt-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[240px] w-full touch-none sm:h-[300px]"
            preserveAspectRatio="none"
            role="img"
            aria-label="Generado hoy por vertical"
            onPointerMove={(e) => {
              const caja = e.currentTarget.getBoundingClientRect();
              const rel = (e.clientX - caja.left) / caja.width;
              setCursor(Math.round(rel * (serie.length - 1)));
            }}
            onPointerLeave={() => setCursor(null)}
          >
            <defs>
              {VERTICALES.map((v) => (
                <linearGradient key={v.id} id={`relleno-${v.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={v.color} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={v.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(0,27,67,0.08)" strokeWidth="1" />
            ))}

            {foco !== 'TODOS' && <polygon points={areaDe(foco)} fill={`url(#relleno-${foco})`} />}

            {series.map((v) => (
              <polyline
                key={v.id}
                points={lineaDe(v.id)}
                fill="none"
                stroke={v.color}
                strokeWidth={foco === 'TODOS' ? 2 : 2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {punto && cursor != null && (
              <>
                <line
                  x1={xDe(cursor)}
                  x2={xDe(cursor)}
                  y1="0"
                  y2={H}
                  stroke="rgba(0,27,67,0.2)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
                {series.map((v) => (
                  <circle key={v.id} cx={xDe(cursor)} cy={yDe(punto.porVertical[v.id])} r="4" fill={v.color} />
                ))}
              </>
            )}
          </svg>

          {/* Las etiquetas del eje van FUERA del SVG: con preserveAspectRatio="none" un <text>
              de adentro se estiraría junto con la gráfica. */}
          <div className="pointer-events-none absolute inset-y-0 left-1 flex flex-col justify-between py-1 text-[10px] tabular-nums text-brand-950/35">
            <span>{usdCorto(techo)}</span>
            <span>{usdCorto(techo / 2)}</span>
            <span>$0</span>
          </div>

          {punto && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-xl border border-brand-950/10 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
              <p className="text-brand-950/45 text-base">{hora(punto.t)}</p>
              {series.map((v) => (
                <p key={v.id} className="flex items-center gap-1.5 tabular-nums text-brand-950/80 text-base">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                  {usd(punto.porVertical[v.id])}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1.5 flex justify-between px-1 text-[10.5px] tabular-nums text-brand-950/35">
          <span>{hora(d.desde)}</span>
          <span>{hora(d.ahora)}</span>
        </div>
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-[24px] border border-brand-950/[0.07] bg-white p-4 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)] sm:p-5">
          <p className="mb-3 font-semibold text-brand-950 text-base">Quién está generando hoy</p>
          {d.ranking.length === 0 ? (
            <p className="py-10 text-center font-light text-brand-950/30 text-xs">Sin movimiento todavía.</p>
          ) : (
            <ul className="space-y-2.5">
              {d.ranking.map((r) => {
                const pct = (r.usd / Math.max(1, d.ranking[0].usd)) * 100;
                const mirando = d.visitantes.porNegocio.find((n) => n.negocio === r.negocio)?.visitantes ?? 0;
                return (
                  <li key={r.negocio}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate text-brand-950/75">
                        {r.negocio}
                        {mirando > 0 && (
                          <span className="ml-1.5 text-[10.5px]" style={{ color: AZUL }}>
                            · {mirando} mirando
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-brand-950">{usd(r.usd)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.06]">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${pct}%`, background: COLOR_DE(r.vertical) }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-[24px] border border-brand-950/[0.07] bg-white p-4 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)] sm:p-5">
          <p className="mb-3 font-semibold text-brand-950 text-base">Últimos movimientos</p>
          {d.ultimos.length === 0 ? (
            <p className="py-10 text-center font-light text-brand-950/30 text-xs">Todavía no se ha generado nada hoy.</p>
          ) : (
            <ul className="space-y-0.5">
              {d.ultimos.map((m, i) => (
                <li key={`${m.cuando}-${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-brand-500/[0.04]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_DE(m.vertical) }} />
                  <span className="w-10 shrink-0 text-[11px] tabular-nums text-brand-950/30">{hora(m.cuando)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-brand-950/80">{m.negocio}</span>
                  <span className="hidden shrink-0 text-[11px] text-brand-950/30 sm:inline">{m.detalle}</span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-brand-950">{usd(m.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectedRestaurant && (
        <RestaurantDiagnostic
          restaurant={selectedRestaurant}
          detail={restaurantDetail}
          loading={detailLoading}
          onClose={() => { setSelectedRestaurant(null); setRestaurantDetail(null); }}
        />
      )}
    </Marco>
  );
}

const STATUS_STYLE: Record<LocalStatus, { label: string; dot: string; className: string }> = {
  OPERANDO: { label: 'Saludable', dot: 'bg-emerald-500', className: 'border-emerald-500/20 bg-emerald-50 text-emerald-700' },
  ATENCION: { label: 'Por vencer', dot: 'bg-amber-500', className: 'border-amber-500/20 bg-amber-50 text-amber-700' },
  CRITICO: { label: 'No disponible', dot: 'bg-red-500', className: 'border-red-500/20 bg-red-50 text-red-700' },
  SIN_ACTIVIDAD: { label: 'Sin conexión', dot: 'bg-slate-400', className: 'border-slate-400/20 bg-slate-50 text-slate-600' },
};

function relativeTime(iso: string | null) {
  if (!iso) return 'Sin actividad en 30 días';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} días`;
}

function OperationSummary({ label, value, tone, icon, wide }: { label: string; value: number | string; tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; icon: React.ReactNode; wide?: boolean }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-500/15',
    amber: 'bg-amber-50 text-amber-700 ring-amber-500/15',
    red: 'bg-red-50 text-red-700 ring-red-500/15',
    slate: 'bg-slate-50 text-slate-600 ring-slate-500/15',
    blue: 'bg-blue-50 text-brand-500 ring-brand-500/15',
  };
  return (
    <div className={`rounded-2xl bg-white/85 p-3 ring-1 backdrop-blur ${tones[tone]} ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function RestaurantIdentity({ restaurant }: { restaurant: RestaurantOperation }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-500/10 text-brand-500">
        {restaurant.logoUrl ? <img src={restaurant.logoUrl} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-brand-950 text-base">{restaurant.name}</p>
        <p className="truncate text-brand-950/38 text-base">{restaurant.branchOf ? `Sede de ${restaurant.branchOf}` : restaurant.plan ?? 'Sin plan'}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LocalStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${style.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${status === 'OPERANDO' ? 'animate-pulse' : ''}`} />
      {style.label}
    </span>
  );
}

function MetricBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const color = value >= 75 ? '#10b981' : value >= 45 ? '#f59e0b' : '#009aff';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {!compact && <span className="text-[10px] text-brand-950/38">Adopción</span>}
        <span className={`${compact ? 'text-sm' : 'text-xs'} font-bold tabular-nums text-brand-950`}>{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="font-semibold uppercase tracking-wide text-brand-950/35 text-base">{label}</p><p className="mt-0.5 font-bold tabular-nums text-brand-950 text-base">{value}</p></div>;
}

function RestaurantDiagnostic({ restaurant, detail, loading, onClose }: { restaurant: RestaurantOperation; detail: RestaurantDetail | null; loading: boolean; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-brand-950/30 backdrop-blur-[2px] animate-[master-ops-fade_.18s_ease-out] motion-reduce:animate-none" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#f8faff] shadow-[-24px_0_70px_-45px_rgba(0,27,67,.55)] animate-[master-ops-slide-in_.24s_ease-out] motion-reduce:animate-none">
        <div className="sticky top-0 z-10 border-b border-brand-950/[0.07] bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold uppercase tracking-[0.15em] text-brand-500 text-xs">Diagnóstico en vivo</p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">{restaurant.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={restaurant.status} /><span className="text-[11px] text-brand-950/40">{relativeTime(restaurant.lastActivityAt)}</span></div>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-950/[0.055] text-brand-950/55 transition hover:bg-brand-950/10"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <DiagnosticMetric label="Salud del local" value={`${restaurant.health}%`} icon={<ShieldCheck className="h-4 w-4" />} />
            <DiagnosticMetric label="Uso" value={`${restaurant.adoption}%`} icon={<Gauge className="h-4 w-4" />} />
            <DiagnosticMetric label="En línea" value={restaurant.activeStaff + restaurant.publicVisitors} icon={<Users className="h-4 w-4" />} />
            <DiagnosticMetric label="Abiertos" value={restaurant.openOrders} icon={<Activity className="h-4 w-4" />} />
          </div>

          <section className="rounded-2xl border border-brand-950/[0.07] bg-white p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-brand-950">Uso por módulo</h3><span className="text-[10px] text-brand-950/35">Según su plan</span></div>
            <div className="mt-3 space-y-3">
              {restaurant.modules.map((module) => (
                <div key={module.id}>
                  <div className="flex items-end justify-between gap-3"><div><p className="font-medium text-brand-950/75 text-xs">{module.label}</p><p className="text-brand-950/35 text-xs">{module.detalle}</p></div><span className="text-xs font-bold tabular-nums text-brand-950">{module.score}%</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.07]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${module.score}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-brand-950/[0.07] bg-white p-4">
            <h3 className="text-sm font-semibold text-brand-950">Señales de salud</h3>
            {restaurant.alerts.length ? (
              <ul className="mt-3 space-y-2">{restaurant.alerts.map((alert, index) => <li key={`${alert.message}-${index}`} className={`flex gap-2 rounded-xl border p-3 text-[11.5px] leading-relaxed ${alert.severity === 'CRITICAL' ? 'border-red-500/15 bg-red-50 text-red-700' : 'border-amber-500/15 bg-amber-50 text-amber-700'}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{alert.message}</li>)}</ul>
            ) : <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-700 text-base">QuickTap está disponible para este local.</p>}
          </section>

          <section className="rounded-2xl border border-brand-950/[0.07] bg-white p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-brand-950">Actividad reciente</h3>{loading && <span className="text-[10px] text-brand-950/35">Cargando…</span>}</div>
            {!loading && detail?.recentEvents.length === 0 && <p className="py-8 text-center text-brand-950/35 text-xs">Sin movimientos recientes.</p>}
            <ul className="mt-2 divide-y divide-brand-950/[0.055]">
              {detail?.recentEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500"><Activity className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-brand-950 text-xs">{event.title}</p><p className="truncate text-brand-950/38 text-base">{event.detail}</p></div>
                  <div className="text-right"><p className="font-semibold tabular-nums text-brand-950 text-xs">{event.currency === 'EUR' ? '€' : '$'}{event.amount.toFixed(2)}</p><p className="text-brand-950/35 text-xs">{relativeTime(event.at)}</p></div>
                </li>
              ))}
            </ul>
          </section>

          {detail?.lowStock.length ? (
            <section className="rounded-2xl border border-amber-500/15 bg-amber-50/70 p-4">
              <h3 className="text-sm font-semibold text-amber-800">Inventario por atender</h3>
              <ul className="mt-2 divide-y divide-amber-900/10">{detail.lowStock.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-[11.5px]"><span className="truncate text-amber-900/75">{item.name}</span><span className="shrink-0 font-semibold tabular-nums text-amber-800">{item.quantity} {item.unit} / mín. {item.minimum}</span></li>)}</ul>
            </section>
          ) : null}

          <p className="px-2 leading-relaxed text-brand-950/35 text-base">La carga de CPU y RAM se mide a nivel global porque todos los locales comparten la infraestructura. “Participación” ({restaurant.activityShare}%) representa la parte de los pedidos de los últimos 30 días generada por este local.</p>
        </div>
      </aside>
    </div>
  );
}

function DiagnosticMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-brand-950/[0.07] bg-white p-3"><div className="flex items-center justify-between text-brand-500"><span className="text-[9px] font-bold uppercase tracking-wide text-brand-950/35">{label}</span>{icon}</div><p className="mt-1 text-xl font-bold tabular-nums text-brand-950">{value}</p></div>;
}

/**
 * Contenedor alineado con el ancho del nuevo centro de control del Dashboard Máster.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-120px)]">
      <div className="mx-auto max-w-[1500px]">{children}</div>
    </div>
  );
}

/** Tarjeta de cifra con su chispa: la línea de atrás da la forma sin ocupar espacio propio. */
function Tarjeta({
  label,
  valor,
  pie,
  icono,
  chispa,
  destacado,
  compacto,
}: {
  label: string;
  valor: string;
  pie: string;
  icono?: React.ReactNode;
  chispa: number[];
  destacado?: boolean;
  compacto?: boolean;
}) {
  const datos = chispa.filter((n) => Number.isFinite(n));
  const max = Math.max(1, ...datos);
  const puntos =
    datos.length > 1 ? datos.map((n, i) => `${(i / (datos.length - 1)) * 100},${28 - (n / max) * 24}`).join(' ') : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-950/[0.07] bg-white p-3.5 shadow-[0_14px_35px_-32px_rgba(0,27,67,0.45)]">
      <p className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-brand-950/42 text-base">
        {icono}
        {label}
      </p>
      <p
        className={`mt-1.5 truncate font-bold tabular-nums ${compacto ? 'text-[17px]' : 'text-[24px]'}`}
        style={{ color: destacado ? AZUL : '#001b43' }}
      >
        {valor}
      </p>
      <p className="mt-0.5 truncate font-light text-brand-950/42 text-xs">{pie}</p>
      {puntos && (
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2 h-7 w-full opacity-70" aria-hidden>
          <polyline points={puntos} fill="none" stroke={AZUL} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
