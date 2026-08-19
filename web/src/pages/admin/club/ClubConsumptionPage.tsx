import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { card } from './clubStyle';
import { ClubDateRangeFilter } from './ClubDateRangeFilter';

interface ConsumedItem {
  productId: string | null;
  name: string;
  qty: string;
  revenueBase: string;
  stock: number | null;
  daysLeft: number | null;
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minStock: number;
}

interface Response {
  top: ConsumedItem[];
  runningOut: ConsumedItem[];
  lowStock: LowStockItem[];
  days: number;
}

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

/**
 * Qué se consume más en el club y qué está por acabarse.
 *
 * El consumo suma los dos caminos por los que baja el stock: la venta de mostrador y lo que
 * los jugadores piden desde la tablet de la cancha (ver consumption en club-stats.service.ts).
 */
export default function ClubConsumptionPage({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [data, setData] = useState<Response | null>(null);
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/club/stats/consumption', { params: { days, from: from || undefined, to: to || undefined } })
      .then((r) => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days, from, to]);

  useEffect(load, [load]);

  if (loading && !data) return <p className="text-sm font-light text-brand-950/40">Cargando consumo…</p>;
  if (!data) return <p className="text-sm text-red-600">No pudimos cargar el consumo.</p>;

  const maxQty = Math.max(1, ...data.top.map((t) => Number(t.qty)));

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => {
                setDays(r.days);
                setFrom('');
                setTo('');
              }}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                !from && !to && days === r.days ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ClubDateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />

      {data.runningOut.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <TrendingDown className="h-4 w-4" />
            Se acaba pronto al ritmo actual
          </p>
          <ul className="mt-2 space-y-1">
            {data.runningOut.map((p) => (
              <li key={p.productId ?? p.name} className="flex justify-between gap-2 text-sm text-amber-900">
                <span className="min-w-0 truncate font-light">{p.name}</span>
                <span className="shrink-0 font-semibold">
                  {p.daysLeft === 0 ? 'hoy' : `${p.daysLeft} día${p.daysLeft === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.lowStock.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-red-900">
            <AlertTriangle className="h-4 w-4" />
            Bajo el mínimo
          </p>
          <ul className="mt-2 space-y-1">
            {data.lowStock.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 text-sm text-red-900">
                <span className="min-w-0 truncate font-light">
                  {p.name}
                  {p.sku && <span className="text-red-900/50"> · {p.sku}</span>}
                </span>
                <span className="shrink-0 font-semibold">
                  {p.stock} de {p.minStock}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Lo que más se consume</p>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Suma la venta de mostrador y lo que se pide desde las canchas.
        </p>

        {data.top.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">
            No hubo consumo registrado en este período.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.top.map((p) => (
              <li key={p.productId ?? p.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-brand-950">{p.name}</span>
                  <span className="shrink-0 font-semibold text-brand-950">{Number(p.qty)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-950/[0.08]">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(Number(p.qty) / maxQty) * 100}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] font-light text-brand-950/40">
                  {formatBase(p.revenueBase, symbol)}
                  {p.stock != null && ` · quedan ${p.stock}`}
                  {p.daysLeft != null && ` · para ${p.daysLeft} día${p.daysLeft === 1 ? '' : 's'}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
