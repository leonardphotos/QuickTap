import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { card } from './clubStyle';

interface FrequentCustomer {
  name: string;
  phone: string | null;
  bookings: number;
  noShows: number;
  totalBase: string;
  avgTicketBase: string;
  lastVisit: string;
}

interface Response {
  customers: FrequentCustomer[];
  totals: { uniqueCustomers: number; returning: number; bookings: number };
}

const RANGES = [
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 365, label: '1 año' },
];

/** Quién vuelve al club y cuánto deja. Se deriva de las reservas, no de un contador guardado
 * (ver frequentCustomers en club-stats.service.ts). */
export default function ClubCustomersPage({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [data, setData] = useState<Response | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/club/stats/customers', { params: { days } })
      .then((r) => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  if (loading && !data) return <p className="text-sm font-light text-brand-950/40">Cargando clientes…</p>;
  if (!data) return <p className="text-sm text-red-600">No pudimos cargar los clientes.</p>;

  const returnRate = data.totals.uniqueCustomers
    ? Math.round((data.totals.returning / data.totals.uniqueCustomers) * 100)
    : 0;

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

      <div className="grid grid-cols-2 gap-3">
        <div className={`${card} p-4`}>
          <p className="text-[22px] font-bold leading-tight text-brand-950">{data.totals.uniqueCustomers}</p>
          <p className="text-[13px] font-semibold text-brand-950/70">Jugadores distintos</p>
          <p className="text-[11px] font-light text-brand-950/40">{data.totals.bookings} reservas</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="text-[22px] font-bold leading-tight text-brand-950">{returnRate}%</p>
          <p className="text-[13px] font-semibold text-brand-950/70">Vuelven</p>
          <p className="text-[11px] font-light text-brand-950/40">{data.totals.returning} con más de una reserva</p>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Clientes frecuentes</p>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Ordenados por cuántas veces reservaron en el período.
        </p>

        {data.customers.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">
            Todavía no hay reservas en este período.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {data.customers.map((c, i) => (
              <li key={`${c.phone ?? c.name}-${i}`} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-950/[0.05] text-xs font-bold text-brand-950/60">
                  {i === 0 && c.bookings > 1 ? <Star className="h-4 w-4 text-amber-500" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-950">{c.name}</span>
                  <span className="block text-xs font-light text-brand-950/50">
                    {c.phone ? `+${c.phone}` : 'Sin teléfono'} · {c.bookings} reserva{c.bookings === 1 ? '' : 's'}
                    {c.noShows > 0 && ` · ${c.noShows} ausencia${c.noShows === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-brand-950">{formatBase(c.totalBase, symbol)}</span>
                  <span className="block text-[11px] font-light text-brand-950/40">
                    {formatBase(c.avgTicketBase, symbol)} promedio
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
