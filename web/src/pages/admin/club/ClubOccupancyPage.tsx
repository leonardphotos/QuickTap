import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { card } from './clubStyle';

interface DayStat {
  date: string;
  weekday: number;
  bookedMinutes: number;
  availableMinutes: number;
  occupancyPercent: number;
  bookings: number;
  revenueBase: string;
}

interface CourtStat {
  courtId: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
  occupancyPercent: number;
}

interface SplitStat {
  hours: number;
  revenueBase: string;
  revenuePerHourBase: string | null;
  sharePercent: number;
}

interface Occupancy {
  byDay: DayStat[];
  byCourt: CourtStat[];
  academyVsRental: { rental: SplitStat; academy: SplitStat };
  totals: {
    bookedMinutes: number;
    rentalMinutes: number;
    academyMinutes: number;
    availableMinutes: number;
    occupancyPercent: number;
    bookings: number;
    classes: number;
    revenueBase: string;
  };
}

const WEEKDAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const RANGES = [
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
  { days: 30, label: '30 días' },
];

function hours(minutes: number): string {
  const h = minutes / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

/**
 * Ocupación de las canchas: cuánta de la capacidad se vendió, día por día.
 *
 * El dato que importa no es la facturación sino el hueco: dos días con la misma
 * plata pueden tener ocupación muy distinta si uno fue a precio de hora pico.
 */
export default function ClubOccupancyPage({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [data, setData] = useState<Occupancy | null>(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/club/stats/occupancy', { params: { days } })
      .then((r) => setData(r.data.data))
      .catch(() => setError('No pudimos cargar la ocupación.'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  if (loading && !data) return <p className="text-sm font-light text-brand-950/40">Cargando ocupación…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const maxPercent = Math.max(1, ...data.byDay.map((d) => d.occupancyPercent));
  const noCapacity = data.totals.availableMinutes === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                days === r.days ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {noCapacity ? (
        <div className={`${card} p-5`}>
          <p className="py-6 text-center text-sm font-light text-brand-950/50">
            Todavía no tienes horarios cargados, así que no hay capacidad contra la cual medir la ocupación.
            Cárgalos en Ajustes → Canchas y horarios.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Ocupación del período" value={`${data.totals.occupancyPercent}%`} sub={`${hours(data.totals.bookedMinutes)} de ${hours(data.totals.availableMinutes)}`} />
            <Metric label="Reservas" value={String(data.totals.bookings)} sub={`${data.totals.classes} clases de academia`} />
          </div>

          {/* Academia vs renta libre: las dos ocupan la misma pista, así que lo que
              decide es cuál deja más por hora. Antes este reporte ni siquiera veía
              las clases y daba la cancha por libre. */}
          {data.totals.bookedMinutes > 0 && (
            <div className={`${card} p-5`}>
              <p className="text-sm font-bold text-brand-950">Academia vs renta libre</p>
              <p className="mt-0.5 text-xs font-light text-brand-950/50">
                Qué deja más cada hora de cancha ocupada.
              </p>

              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
                <div className="h-full bg-brand-500" style={{ width: `${data.academyVsRental.rental.sharePercent}%` }} />
                <div className="h-full bg-sky-500" style={{ width: `${data.academyVsRental.academy.sharePercent}%` }} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <SplitCard
                  dot="bg-brand-500"
                  label="Renta libre"
                  stat={data.academyVsRental.rental}
                  symbol={symbol}
                />
                <SplitCard dot="bg-sky-500" label="Academia" stat={data.academyVsRental.academy} symbol={symbol} />
              </div>

              {data.academyVsRental.rental.revenuePerHourBase && data.academyVsRental.academy.revenuePerHourBase && (
                <p className="mt-3 rounded-xl bg-brand-950/[0.03] p-3 text-xs font-light text-brand-950/60">
                  {Number(data.academyVsRental.academy.revenuePerHourBase) >
                  Number(data.academyVsRental.rental.revenuePerHourBase)
                    ? 'La academia deja más por hora de cancha que la renta libre.'
                    : 'La renta libre deja más por hora de cancha que la academia.'}
                </p>
              )}
            </div>
          )}

          <div className={`${card} p-5`}>
            <p className="text-sm font-bold text-brand-950">Ocupación por día</p>
            <p className="mt-0.5 text-xs font-light text-brand-950/50">
              Qué porcentaje de las horas disponibles se vendió cada día.
            </p>

            {/* Barras a mano: el proyecto no tiene librería de gráficos (mismo patrón que
                "Ventas por hora" en el panel de restaurante). */}
            <div className="mt-4 flex h-40 gap-1.5 overflow-x-auto">
              {data.byDay.map((d) => (
                <div key={d.date} className="flex h-full min-w-6 flex-1 flex-col items-center gap-1">
                  <span className="shrink-0 text-[10px] font-semibold text-brand-950/50">
                    {d.occupancyPercent > 0 ? `${d.occupancyPercent}%` : ''}
                  </span>
                  {/* El alto de la barra es % de ESTE contenedor, que sí tiene altura definida
                      (flex-1 dentro de un h-40). Sobre la columna entera no resolvería. */}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${d.date} · ${d.occupancyPercent}% · ${d.bookings} reservas · ${formatBase(d.revenueBase, symbol)}`}
                      className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-brand-400 transition-[height] duration-300"
                      style={{
                        // Mínimo visible aunque sea 0: una barra invisible parece un error de carga.
                        height: `${Math.max(3, (d.occupancyPercent / maxPercent) * 100)}%`,
                        opacity: d.occupancyPercent === 0 ? 0.18 : 1,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
              {data.byDay.map((d) => (
                <div key={d.date} className="min-w-6 flex-1 text-center">
                  <span className="block text-[10px] font-semibold text-brand-950/60">{WEEKDAY_SHORT[d.weekday]}</span>
                  <span className="block text-[9px] font-light text-brand-950/35">{d.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <p className="text-sm font-bold text-brand-950">Por cancha</p>
            <p className="mt-0.5 text-xs font-light text-brand-950/50">
              Cuál se está quedando vacía en el mismo período.
            </p>
            <ul className="mt-3 space-y-2.5">
              {[...data.byCourt]
                .sort((a, b) => b.occupancyPercent - a.occupancyPercent)
                .map((c) => (
                  <li key={c.courtId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-brand-950">{c.name}</span>
                      <span className="shrink-0 font-semibold text-brand-950">{c.occupancyPercent}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-950/[0.08]">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                        style={{ width: `${Math.min(100, c.occupancyPercent)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] font-light text-brand-950/40">
                      {hours(c.bookedMinutes)} vendidas de {hours(c.availableMinutes)}
                    </p>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function SplitCard({
  dot,
  label,
  stat,
  symbol,
}: {
  dot: string;
  label: string;
  stat: SplitStat;
  symbol: string;
}) {
  return (
    <div className="rounded-2xl bg-brand-950/[0.03] p-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-950">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-1.5 text-[19px] font-bold leading-none tracking-tight text-brand-950">
        {stat.revenuePerHourBase ? formatBase(stat.revenuePerHourBase, symbol) : '—'}
      </p>
      <p className="text-[11px] font-light text-brand-950/40">por hora de cancha</p>
      <p className="mt-1.5 text-[12px] font-light text-brand-950/50">
        {stat.hours} h · {formatBase(stat.revenueBase, symbol)}
      </p>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[22px] font-bold leading-tight tracking-tight text-brand-950">{value}</p>
      <p className="text-[13px] font-semibold text-brand-950/70">{label}</p>
      <p className="text-[11px] font-light text-brand-950/40">{sub}</p>
    </div>
  );
}
