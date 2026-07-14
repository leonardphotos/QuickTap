import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import type { Currency } from '@/types';

interface TodaySummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  currency: Currency;
  byChannel: { DINE_IN: number; DELIVERY: number; PICKUP: number };
}

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro' };

/** Resumen de ventas del día (hora de Caracas) en el Dashboard del restaurante. */
export function DailySalesSummary() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);

  useEffect(() => {
    api.get('/orders/summary/today').then((res) => setSummary(res.data.data));
  }, []);

  if (!summary) return null;

  const channels = Object.entries(summary.byChannel).filter(([, count]) => count > 0);

  return (
    <div className="w-full max-w-md mb-8 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 text-left">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-brand-500" />
        <p className="text-sm font-semibold text-brand-950">Ventas de hoy</p>
      </div>
      <p className="text-2xl font-semibold text-brand-950">{formatBsAbsolute(summary.totalBs)}</p>
      <p className="text-xs text-brand-950/50 font-light">
        {formatBase(summary.totalBase, CURRENCY_SYMBOLS[summary.currency])}
      </p>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-xs bg-brand-950/[0.06] text-brand-950/70 px-2.5 py-1 rounded-full font-medium">
          {summary.ordersCount} pedido{summary.ordersCount === 1 ? '' : 's'}
        </span>
        {channels.map(([channel, count]) => (
          <span key={channel} className="text-xs bg-brand-950/[0.06] text-brand-950/60 px-2.5 py-1 rounded-full">
            {CHANNEL_LABEL[channel] ?? channel}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
