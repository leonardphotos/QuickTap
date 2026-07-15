import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';

interface ChannelBreakdown {
  DINE_IN: number;
  DELIVERY: number;
  PICKUP: number;
}

interface PeriodSummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  byChannel: ChannelBreakdown;
}

interface AdminSummary {
  currency: string;
  today: PeriodSummary;
  month: PeriodSummary;
  allTime: PeriodSummary;
}

const CHANNEL_LABELS: Record<keyof ChannelBreakdown, string> = {
  DINE_IN: 'En mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
};

/** Administración: resumen de ventas/ingresos del restaurante. Exclusivo del plan Premium. */
export default function AdministrationPage() {
  const { restaurant } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/summary/admin')
      .then((res) => setSummary(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el resumen.'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Administración</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">Resumen de ventas e ingresos de tu restaurante.</p>
      </div>

      <PeriodSection title="Hoy" period={summary.today} symbol={restaurant?.currencySymbol ?? '$'} />
      <PeriodSection title="Este mes" period={summary.month} symbol={restaurant?.currencySymbol ?? '$'} />
      <PeriodSection title="Histórico" period={summary.allTime} symbol={restaurant?.currencySymbol ?? '$'} />
    </div>
  );
}

function PeriodSection({ title, period, symbol }: { title: string; period: PeriodSummary; symbol: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-brand-950/70 mb-3">{title}</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{formatBsAbsolute(period.totalBs)}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">En bolívares</p>
        </div>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{formatBase(period.totalBase, symbol)}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">En {symbol}</p>
        </div>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
          <p className="text-2xl font-semibold text-brand-950">{period.ordersCount}</p>
          <p className="text-xs text-brand-950/50 font-light mt-1">
            Pedidos ·{' '}
            {(Object.keys(CHANNEL_LABELS) as (keyof ChannelBreakdown)[])
              .filter((k) => period.byChannel[k] > 0)
              .map((k) => `${CHANNEL_LABELS[k]}: ${period.byChannel[k]}`)
              .join(' · ') || 'sin pedidos'}
          </p>
        </div>
      </div>
    </div>
  );
}
