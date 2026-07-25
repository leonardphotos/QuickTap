import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
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

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? 'am' : 'pm'}`;
}

/** Resumen visual de ventas del día (escritorio / iPad horizontal, >=1024px): tarjetas
 * de métricas + ventas por hora. En celular no aporta nada nuevo frente a la tarjeta
 * compacta de DailySalesSummary, así que solo se monta en pantallas anchas. */
export function SalesDashboard() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);

  function load() {
    api.get('/orders/summary/today').then((res) => setSummary(res.data.data));
  }

  useEffect(() => {
    load();

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!summary) return null;

  const symbol = CURRENCY_SYMBOLS[summary.currency];
  const maxHourBase = Math.max(1, ...summary.byHour.map((h) => Number(h.totalBase)));
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

      <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-6">
        <h3 className="text-[15px] font-semibold text-brand-950 mb-5">Ventas por hora</h3>
        {summary.byHour.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">Sin ventas todavía hoy.</p>
        ) : (
          <>
            <div className="flex items-end gap-3 h-36">
              {summary.byHour.map((h) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full rounded-t-[7px] bg-gradient-to-b from-brand-400 to-brand-500"
                    style={{ height: `${Math.max(6, (Number(h.totalBase) / maxHourBase) * 100)}%` }}
                    title={`${formatHour(h.hour)}: ${formatBase(h.totalBase, symbol)} · ${h.ordersCount} pedido${h.ordersCount === 1 ? '' : 's'}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3">
              {summary.byHour.map((h) => (
                <span key={h.hour} className="flex-1 text-center text-xs text-brand-950/40 font-medium">
                  {formatHour(h.hour)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
