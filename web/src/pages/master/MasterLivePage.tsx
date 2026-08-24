import { useEffect, useRef, useState } from 'react';
import { Activity, Eye } from 'lucide-react';
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
 * Un color por vertical, sostenido en toda la pantalla: la línea de la gráfica, el punto de la
 * leyenda y la pastilla del ticker son el mismo color. Sin eso hay que leer cada etiqueta para
 * saber de quién se está hablando.
 */
const VERTICALES: { id: Vertical; label: string; color: string }[] = [
  { id: 'RESTAURANT', label: 'Restaurantes', color: '#38bdf8' },
  { id: 'SHOP', label: 'Locales', color: '#34d399' },
  { id: 'SPORTS_CLUB', label: 'Canchas', color: '#fbbf24' },
  { id: 'ADMIN_OFFICE', label: 'Administración', color: '#c084fc' },
];

const REFRESCO_MS = 8000;

const usd = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCorto = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

/**
 * Estadísticas en vivo de toda la plataforma.
 *
 * Una sola gráfica con los cuatro verticales sobre el mismo eje: la pregunta que se responde
 * acá es "cómo va la plataforma hoy y quién está empujando", y eso no se ve en cuatro tarjetas
 * separadas. Las líneas son acumuladas —lo que lleva generado el día— así que suben y nunca
 * bajan, como la curva de una sesión de mercado.
 *
 * La gráfica es un SVG a mano: son cuatro polilíneas sobre una grilla, no hace falta traer una
 * librería de gráficos al bundle del maestro para eso.
 */
export default function MasterLivePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocultos, setOcultos] = useState<Vertical[]>([]);
  const [pausado, setPausado] = useState(false);
  // Se guarda entre refrescos para que el "$0,00" del primer render no borre la gráfica.
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
  if (!d) {
    return (
      <p className={`p-8 text-sm ${error ? 'text-red-600' : 'text-brand-950/50'}`}>{error ?? 'Cargando…'}</p>
    );
  }

  const visibles = VERTICALES.filter((v) => !ocultos.includes(v.id));
  const serie = d.serie;
  // El techo del eje sale del total, no de la línea más alta: así las cuatro se leen a la
  // misma escala y se ve cuál pesa de verdad en la suma.
  const techo = Math.max(1, ...serie.map((p) => Math.max(...visibles.map((v) => p.porVertical[v.id]))));

  const W = 1000;
  const H = 280;
  const PAD_X = 8;
  const puntosDe = (v: Vertical) =>
    serie
      .map((p, i) => {
        const x = PAD_X + (i / Math.max(1, serie.length - 1)) * (W - PAD_X * 2);
        const y = H - (p.porVertical[v] / techo) * (H - 16) - 8;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-950">En vivo</h1>
          <p className="mt-0.5 text-sm font-light text-brand-950/50">
            Lo que está generando la plataforma hoy, desde las {hora(d.desde)}. Se actualiza solo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPausado((p) => !p)}
          className="flex items-center gap-2 rounded-full border border-brand-950/15 px-3.5 py-2 text-xs font-semibold text-brand-950/70 transition-colors hover:bg-brand-950/[0.04]"
        >
          <span className={`h-2 w-2 rounded-full ${pausado ? 'bg-brand-950/25' : 'animate-pulse bg-emerald-400'}`} />
          {pausado ? 'Reanudar' : 'En vivo'}
        </button>
      </div>

      {error && <p className="text-xs text-amber-600">{error}</p>}

      {/* ---------- Cifras de cabecera ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra
          icono={<Eye className="h-4 w-4" />}
          label="En la página ahora"
          valor={String(d.visitantes.total)}
          sub={d.visitantes.porNegocio[0]?.negocio ?? 'Nadie navegando'}
          acento="text-emerald-600"
        />
        <Cifra
          icono={<Activity className="h-4 w-4" />}
          label="Operaciones de hoy"
          valor={String(d.totalDia.operaciones)}
          sub="Pedidos, ventas y reservas"
        />
        <Cifra label="Generado hoy" valor={usd(d.totalDia.usd)} sub="Suma de los cuatro verticales" />
        <Cifra
          label="Va ganando"
          valor={d.ranking[0]?.negocio ?? '—'}
          sub={d.ranking[0] ? `${usd(d.ranking[0].usd)} · ${d.ranking[0].operaciones} ops` : 'Sin movimiento todavía'}
        />
      </div>

      {/* ---------- La gráfica ---------- */}
      <div className="rounded-2xl border border-brand-950/[0.08] bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {VERTICALES.map((v) => {
            const activo = !ocultos.includes(v.id);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setOcultos((o) => (o.includes(v.id) ? o.filter((x) => x !== v.id) : [...o, v.id]))}
                className={`flex items-center gap-2 text-xs font-semibold transition-opacity ${activo ? '' : 'opacity-35'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
                <span className="text-brand-950/60">{v.label}</span>
                <span className="tabular-nums text-brand-950">{usdCorto(d.totales[v.id].usd)}</span>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-xl bg-[#080d15]">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" preserveAspectRatio="none" role="img" aria-label="Generado hoy por vertical">
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            ))}
            {visibles.map((v) => (
              <polyline
                key={v.id}
                points={puntosDe(v.id)}
                fill="none"
                stroke={v.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] tabular-nums text-brand-950/35">
          <span>{hora(d.desde)}</span>
          <span>techo {usdCorto(techo)}</span>
          <span>{hora(d.ahora)}</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---------- Ticker ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] bg-white p-4 shadow-sm">
          <p className="mb-2.5 text-sm font-semibold text-brand-950">Últimos movimientos</p>
          {d.ultimos.length === 0 ? (
            <p className="py-6 text-center text-xs font-light text-brand-950/40">Todavía no se ha generado nada hoy.</p>
          ) : (
            <ul className="space-y-1">
              {d.ultimos.map((m, i) => {
                const v = VERTICALES.find((x) => x.id === m.vertical)!;
                return (
                  <li key={`${m.cuando}-${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-brand-950/[0.03]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} />
                    <span className="w-10 shrink-0 text-[11px] tabular-nums text-brand-950/40">{hora(m.cuando)}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-brand-950/80">{m.negocio}</span>
                    <span className="shrink-0 text-[11px] text-brand-950/40">{m.detalle}</span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-brand-950">{usd(m.monto)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---------- Ranking del día ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] bg-white p-4 shadow-sm">
          <p className="mb-2.5 text-sm font-semibold text-brand-950">Quién está generando hoy</p>
          {d.ranking.length === 0 ? (
            <p className="py-6 text-center text-xs font-light text-brand-950/40">Sin movimiento todavía.</p>
          ) : (
            <ul className="space-y-2">
              {d.ranking.map((r) => {
                const v = VERTICALES.find((x) => x.id === r.vertical)!;
                const pct = (r.usd / Math.max(1, d.ranking[0].usd)) * 100;
                const mirando = d.visitantes.porNegocio.find((n) => n.negocio === r.negocio)?.visitantes ?? 0;
                return (
                  <li key={r.negocio}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0 truncate text-brand-950/80">
                        {r.negocio}
                        {mirando > 0 && (
                          <span className="ml-1.5 text-[10.5px] text-emerald-600">· {mirando} mirando</span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-brand-950">{usd(r.usd)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.07]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: v.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Cifra({
  icono,
  label,
  valor,
  sub,
  acento,
}: {
  icono?: React.ReactNode;
  label: string;
  valor: string;
  sub: string;
  acento?: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-950/[0.08] bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-950/45">
        {icono}
        {label}
      </p>
      <p className={`mt-1.5 truncate text-2xl font-bold tabular-nums ${acento ?? 'text-brand-950'}`}>{valor}</p>
      <p className="mt-0.5 truncate text-[11.5px] font-light text-brand-950/45">{sub}</p>
    </div>
  );
}
