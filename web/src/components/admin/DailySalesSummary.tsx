import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { TrendingUp, Plus } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { ExpenseFormDialog } from './ExpenseFormDialog';
import type { Currency } from '@/types';

interface TodaySummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  currency: Currency;
  byChannel: { DINE_IN: number; DELIVERY: number; PICKUP: number; BAR: number };
  ingresosBase: string;
  ingresosBs: string;
  egresosBase: string;
  egresosBs: string;
  balanceBase: string;
  balanceBs: string;
}

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro', BAR: 'Barra' };

/** Resumen de ventas del día (hora de Caracas) en el Dashboard del restaurante. */
export function DailySalesSummary() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

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
  const channels = Object.entries(summary.byChannel).filter(([, count]) => count > 0);

  return (
    <div className="w-full max-w-md lg:max-w-none mb-8 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 text-left">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-brand-500" />
        <p className="text-sm font-semibold text-brand-950">Movimientos del día</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-lg font-semibold text-emerald-600">{formatBsAbsolute(summary.ingresosBs)}</p>
          <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.ingresosBase, symbol)}</p>
          <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Ingresos</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-red-600">{formatBsAbsolute(summary.egresosBs)}</p>
          <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.egresosBase, symbol)}</p>
          <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Egresos</p>
        </div>
        <div>
          <p className={`text-lg font-semibold ${Number(summary.balanceBase) < 0 ? 'text-red-600' : 'text-brand-950'}`}>
            {formatBsAbsolute(summary.balanceBs)}
          </p>
          <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.balanceBase, symbol)}</p>
          <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Balance</p>
        </div>
      </div>

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

      <TextureButton
        variant="secondary"
        size="sm"
        className="!w-auto px-3 mt-3 flex items-center gap-1.5"
        onClick={() => setShowExpenseDialog(true)}
      >
        <Plus className="h-3.5 w-3.5" /> Añadir egreso
      </TextureButton>

      {showExpenseDialog && (
        <ExpenseFormDialog
          onClose={() => setShowExpenseDialog(false)}
          onCreated={() => {
            setShowExpenseDialog(false);
            load();
          }}
        />
      )}
    </div>
  );
}
