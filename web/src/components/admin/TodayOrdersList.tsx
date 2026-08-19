import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { Currency } from '@/types';

interface OrderRow {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
  totalBase: string;
  currency: Currency;
  customerName: string | null;
  table: string | null;
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro', BAR: 'Barra' };

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

    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!orders) return null;

  return (
    <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-[15px] font-semibold text-brand-950">Pedidos de hoy</h3>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> En vivo
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-brand-950/40 font-light">Sin pedidos todavía hoy.</p>
      ) : (
        <div className="divide-y divide-brand-950/[0.06] max-h-[420px] overflow-y-auto">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-950">
                  {o.table ? `Mesa ${o.table}` : CHANNEL_LABEL[o.channel]}
                  {o.customerName && <span className="text-brand-950/50 font-normal"> · {o.customerName}</span>}
                </p>
                <p className="text-xs text-brand-950/40 font-light">
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
