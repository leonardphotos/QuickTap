import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { GeneralKpisCard } from './GeneralKpisCard';
import type { Currency } from '@/types';

interface TodaySummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  currency: Currency;
  tipBase: string;
  tipBs: string;
  avgTicketBase: string;
  avgTicketBs: string;
  byHour: { hour: number; totalBase: string; ordersCount: number }[];
}

/** Resumen visual de ventas del día (escritorio / iPad horizontal, >=1024px): tarjetas
 * de métricas + KPI general. En celular no aporta nada nuevo frente a la tarjeta
 * compacta de DailySalesSummary, así que solo se monta en pantallas anchas. */
export function SalesDashboard() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);

  function load() {
    api.get('/orders/summary/today').then((res) => setSummary(res.data.data));
  }

  useEffect(() => {
    load();

    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!summary) return null;

  const symbol = CURRENCY_SYMBOLS[summary.currency];
  const todayLabel = new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long' });

  const stats = [
    { label: 'Ventas de hoy', value: formatBsAbsolute(summary.totalBs), sub: formatBase(summary.totalBase, symbol) },
    {
      label: 'Pedidos',
      value: String(summary.ordersCount),
      sub: `${summary.ordersCount === 1 ? 'pedido' : 'pedidos'} completados`,
    },
    { label: 'Propinas', value: formatBsAbsolute(summary.tipBs), sub: formatBase(summary.tipBase, symbol) },
    { label: 'Ticket promedio', value: formatBsAbsolute(summary.avgTicketBs), sub: 'por pedido' },
  ];

  return (
    <div className="hidden lg:block mb-8">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-brand-950 tracking-tight">Panel de ventas</h2>
        <p className="text-sm text-brand-950/50 mt-0.5">Hoy, {todayLabel}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
            <p className="text-sm font-medium text-brand-950/50">{s.label}</p>
            <p className="text-[26px] font-bold text-brand-950 tracking-tight mt-1.5">{s.value}</p>
            <p className="text-xs font-medium text-brand-950/40 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <GeneralKpisCard />
    </div>
  );
}
