import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Eye, TrendingUp } from 'lucide-react';
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
}

/**
 * Un color por vertical, sostenido en toda la pantalla: la línea, el punto de la pestaña y la
 * barra del ranking son el mismo, así no hay que leer la etiqueta para saber de quién se habla.
 * Toda la escala vive en el azul de QuickTap y sus vecinos — sobre negro se distinguen entre sí
 * sin que ninguno grite más que el otro.
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
 * Panel oscuro dentro del maestro, que es claro: no es decoración, es lo que hace legible una
 * gráfica de cuatro series finas de color — sobre blanco se lavan. Por eso el fondo se sale de
 * los márgenes del layout y ocupa la pantalla completa.
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

  if (!d) {
    return (
      <Marco>
        <p className={`py-24 text-center text-sm ${error ? 'text-red-400' : 'text-white/40'}`}>{error ?? 'Cargando…'}</p>
      </Marco>
    );
  }

  const serie = d.serie;
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
          <h1 className="text-[26px] font-bold tracking-tight text-white">En vivo</h1>
          <p className="mt-0.5 text-[13px] font-light text-white/40">
            Lo que está generando la plataforma hoy, desde las {hora(d.desde)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPausado((p) => !p)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.08]"
        >
          <span
            className={`h-2 w-2 rounded-full ${pausado ? 'bg-white/30' : 'animate-pulse'}`}
            style={pausado ? undefined : { background: AZUL }}
          />
          {pausado ? 'Reanudar' : 'En vivo'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-amber-400">{error}</p>}

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

      <section className="mt-3 rounded-2xl border border-white/[0.07] bg-[#0c1119] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-white">Generado hoy</p>
          <p className="text-[22px] font-bold tabular-nums" style={{ color: foco === 'TODOS' ? '#fff' : COLOR_DE(foco) }}>
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
                  activo ? 'text-white' : 'text-white/45 hover:text-white/70'
                }`}
                style={activo ? { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}59` } : undefined}
              >
                {f !== 'TODOS' && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                {label}
                {f !== 'TODOS' && <span className="tabular-nums text-white/45">{usdCorto(d.totales[f].usd)}</span>}
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
                  <stop offset="0%" stopColor={v.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={v.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
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
                  stroke="rgba(255,255,255,0.25)"
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
          <div className="pointer-events-none absolute inset-y-0 left-1 flex flex-col justify-between py-1 text-[10px] tabular-nums text-white/25">
            <span>{usdCorto(techo)}</span>
            <span>{usdCorto(techo / 2)}</span>
            <span>$0</span>
          </div>

          {punto && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-xl border border-white/10 bg-[#0c1119]/95 px-3 py-2 backdrop-blur-sm">
              <p className="text-[10.5px] text-white/40">{hora(punto.t)}</p>
              {series.map((v) => (
                <p key={v.id} className="flex items-center gap-1.5 text-[11.5px] tabular-nums text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                  {usd(punto.porVertical[v.id])}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1.5 flex justify-between px-1 text-[10.5px] tabular-nums text-white/25">
          <span>{hora(d.desde)}</span>
          <span>{hora(d.ahora)}</span>
        </div>
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/[0.07] bg-[#0c1119] p-4 sm:p-5">
          <p className="mb-3 text-[15px] font-semibold text-white">Quién está generando hoy</p>
          {d.ranking.length === 0 ? (
            <p className="py-10 text-center text-xs font-light text-white/30">Sin movimiento todavía.</p>
          ) : (
            <ul className="space-y-2.5">
              {d.ranking.map((r) => {
                const pct = (r.usd / Math.max(1, d.ranking[0].usd)) * 100;
                const mirando = d.visitantes.porNegocio.find((n) => n.negocio === r.negocio)?.visitantes ?? 0;
                return (
                  <li key={r.negocio}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate text-white/80">
                        {r.negocio}
                        {mirando > 0 && (
                          <span className="ml-1.5 text-[10.5px]" style={{ color: AZUL }}>
                            · {mirando} mirando
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-white">{usd(r.usd)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
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

        <section className="rounded-2xl border border-white/[0.07] bg-[#0c1119] p-4 sm:p-5">
          <p className="mb-3 text-[15px] font-semibold text-white">Últimos movimientos</p>
          {d.ultimos.length === 0 ? (
            <p className="py-10 text-center text-xs font-light text-white/30">Todavía no se ha generado nada hoy.</p>
          ) : (
            <ul className="space-y-0.5">
              {d.ultimos.map((m, i) => (
                <li key={`${m.cuando}-${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_DE(m.vertical) }} />
                  <span className="w-10 shrink-0 text-[11px] tabular-nums text-white/30">{hora(m.cuando)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{m.negocio}</span>
                  <span className="hidden shrink-0 text-[11px] text-white/30 sm:inline">{m.detalle}</span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-white">{usd(m.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Marco>
  );
}

/**
 * Saca el panel de los márgenes del maestro para que el negro llegue a los bordes. Sin esto
 * queda una tarjeta oscura flotando sobre el gris del layout, que es justo lo que no se pidió.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-6 -my-10 min-h-[calc(100vh-56px)] bg-[#05070b] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">{children}</div>
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
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c1119] p-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-white/35">
        {icono}
        {label}
      </p>
      <p
        className={`mt-1.5 truncate font-bold tabular-nums ${compacto ? 'text-[17px]' : 'text-[24px]'}`}
        style={{ color: destacado ? AZUL : '#fff' }}
      >
        {valor}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-light text-white/35">{pie}</p>
      {puntos && (
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2 h-7 w-full opacity-70" aria-hidden>
          <polyline points={puntos} fill="none" stroke={AZUL} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
