import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { GeneralKpisCard } from './GeneralKpisCard';
import { ArrowUpRight,ReceiptText,Sparkles,WalletCards } from 'lucide-react';
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

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
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
    { label: 'Ventas de hoy', value: formatBsAbsolute(summary.totalBs), sub: formatBase(summary.totalBase, symbol), icon: WalletCards },
    {
      label: 'Pedidos',
      value: String(summary.ordersCount),
      sub: `${summary.ordersCount === 1 ? 'pedido' : 'pedidos'} completados`,
      icon: ReceiptText,
    },
    { label: 'Propinas', value: formatBsAbsolute(summary.tipBs), sub: formatBase(summary.tipBase, symbol), icon: Sparkles },
    { label: 'Ticket promedio', value: formatBsAbsolute(summary.avgTicketBs), sub: 'por pedido', icon: ArrowUpRight },
  ];

  return (
    <section className="hidden lg:block mb-7 rounded-[30px] border border-brand-950/[0.06] bg-white/[0.72] p-5 shadow-[0_18px_44px_-34px_rgba(0,27,67,0.30)] backdrop-blur-xl xl:p-6" aria-label="Ventas de hoy">
      <div className="mb-5 flex items-end justify-between gap-4 px-0.5">
        <div>
          <p className="font-bold uppercase tracking-[0.12em] text-brand-500 text-xs">Resumen del turno</p>
          <h2 className="mt-1 text-[26px] font-bold tracking-[-0.04em] text-brand-950">Vista general</h2>
        </div>
        <p className="mb-1 rounded-full bg-brand-950/[0.045] px-3 py-1.5 font-medium text-brand-950/50 text-xs">{todayLabel}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, index) => {
          const Icon = s.icon;
          const isPrimary = index === 0;
          return (
          <div
            key={s.label}
            className={`relative min-h-[154px] overflow-hidden rounded-[22px] p-5 shadow-[0_1px_2px_rgba(17,24,39,0.03)] transition-[transform,box-shadow] duration-200 ease-out-strong hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-22px_rgba(0,27,67,0.22)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
              isPrimary ? 'bg-gradient-to-br from-brand-500 via-[#237aff] to-[#5636e8] text-white shadow-[0_14px_32px_rgba(0,117,255,0.20)]' : 'border border-brand-950/[0.055] bg-white/90 text-brand-950'
            }`}
          >
            {isPrimary && <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />}
            <div className={`relative flex h-9 w-9 items-center justify-center rounded-xl ${isPrimary ? 'bg-white/16 text-white' : 'bg-brand-500/10 text-brand-500'}`}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <p className={`relative mt-4 text-sm font-semibold ${isPrimary ? 'text-white/85' : 'text-brand-950/52'}`}>{s.label}</p>
            <p className="relative mt-1 text-[25px] font-bold leading-none tracking-[-0.04em]">{s.value}</p>
            <p className={`relative mt-2 text-xs font-medium ${isPrimary ? 'text-white/70' : 'text-brand-950/40'}`}>{s.sub}</p>
          </div>
          );
        })}
      </div>

      <div className="mt-4"><GeneralKpisCard /></div>
    </section>
  );
}
