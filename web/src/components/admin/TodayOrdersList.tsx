import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Currency } from '@/types';

interface OrderRow {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
  totalBase: string;
  currency: Currency;
  customerName: string | null;
  table: string | null;
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro', BAR: 'Barra', EXPRESS: 'Express' };

/** Lista de solo lectura de los pedidos del día (Resumen, escritorio/iPad). Se actualiza sola
 * en vivo por socket — la cola accionable (aceptar, cambiar estado) vive aparte en Comandas. */
export function TodayOrdersList() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  function load() {
    api.get('/orders/history', { params: { range: 'day', pageSize: 100 } }).then((res) => {
      const rows: OrderRow[] = res.data.data.orders;
      setOrders([...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    });
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

  if (!orders) return null;

  return (
    <div className="rounded-[26px] border border-brand-950/[0.06] bg-white/85 p-6 shadow-[0_16px_36px_-30px_rgba(0,27,67,0.32)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold tracking-[-0.02em] text-brand-950">Pedidos de hoy</h3>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> En vivo
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="text-brand-950/40 font-light text-base">Sin pedidos todavía hoy.</p>
      ) : (
        <div className="max-h-[470px] divide-y divide-brand-950/[0.06] overflow-y-auto pr-1">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-brand-950 text-base">
                  {o.table ? o.table : CHANNEL_LABEL[o.channel]}
                  {o.customerName && <span className="text-brand-950/50 font-normal"> · {o.customerName}</span>}
                </p>
                <p className="text-brand-950/40 font-light text-xs">
                  #{o.orderNumber} ·{' '}
                  {new Date(o.createdAt).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <span className="text-sm font-semibold text-brand-500 shrink-0">
                {formatBase(o.totalBase, CURRENCY_SYMBOLS[o.currency])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
