import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { RANGE_LABELS, type Range } from '@/components/admin/OrderHistorySection';

interface CourierStatsRow {
  courierId: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
  deliveries: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
}

/**
 * Cuánto ha movido cada motorizado en el período: entregas, monto despachado y propinas.
 * Vive dentro de la pantalla de Delivery (antes era la pestaña "Delivery" de Administración),
 * que es donde el dueño ya está mirando el reparto.
 */
export function CourierStatsSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<CourierStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/couriers', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento de delivery.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      deliveries: acc.deliveries + r.deliveries,
      totalBase: acc.totalBase + Number(r.totalBase),
      tips: acc.tips + Number(r.totalTipBase),
    }),
    { deliveries: 0, totalBase: 0, tips: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
        <div className="hidden items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40 sm:flex">
          <span className="flex-1">Repartidor</span>
          <span className="w-40 text-right">Entregas / Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && (
            <p className="p-5 text-sm font-light text-brand-950/40">
              Agrega repartidores en Ajustes → Equipo de Delivery para ver su movimiento aquí.
            </p>
          )}
          {rows?.map((r) => (
            <div key={r.courierId} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-brand-950">
                  {r.name}
                  {!r.isActive && <span className="text-xs font-light text-brand-950/40">(inactivo)</span>}
                </p>
                <p className="text-xs font-light text-brand-950/40">{r.whatsappPhone}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-brand-950">{r.deliveries} entregas</p>
                <p className="text-xs font-light text-brand-950/50">
                  {formatBase(r.totalBase, symbol)}
                  {Number(r.totalTipBase) > 0 && ` · propinas ${formatBase(r.totalTipBase, symbol)}`}
                </p>
              </div>
            </div>
          ))}
          {(rows?.length ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3 bg-brand-950/[0.02] px-5 py-3 text-sm font-semibold text-brand-950">
              <span>Total · {RANGE_LABELS[range]}</span>
              <span className="text-right">
                {totals.deliveries} entregas · {formatBase(totals.totalBase.toFixed(2), symbol)}
                {totals.tips > 0 && ` · propinas ${formatBase(totals.tips.toFixed(2), symbol)}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
