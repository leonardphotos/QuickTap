import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { api, getToken } from '../../api/client';
import type { OrderView } from '../../types';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '../../utils/format';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [connected, setConnected] = useState(false);

  function load() {
    api.get('/orders/kitchen').then((res) => setOrders(res.data.data));
  }

  useEffect(() => {
    load();

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', () => load());
    socket.on('order:updated', () => load());

    return () => {
      socket.disconnect();
    };
  }, []);

  async function setStatus(id: string, status: string) {
    await api.patch(`/orders/${id}/status`, { status });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-gray-900">Cola de Cocina</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
          {connected ? '● En vivo' : '○ Conectando…'}
        </span>
      </div>

      {orders.length === 0 && <p className="text-sm text-gray-400 py-10 text-center">No hay comandas pendientes.</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((o) => (
          <div key={o.id} className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900">#{o.orderNumber}</p>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                {o.channel === 'DINE_IN' ? `Mesa ${o.table?.number ?? ''}` : o.channel}
              </span>
            </div>
            <ul className="text-sm space-y-1">
              {o.items.map((it) => (
                <li key={it.id}>
                  <span className="font-medium">{it.quantity}x</span> {it.productName}
                  {it.modifiers.length > 0 && (
                    <span className="text-gray-500"> ({it.modifiers.join(', ')})</span>
                  )}
                  {it.note && <span className="block text-xs text-gray-500">📝 {it.note}</span>}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold">
              {formatBsAbsolute(o.totalBs)}{' '}
              <span className="text-gray-400 font-normal">({formatBase(o.totalBase, CURRENCY_SYMBOLS[o.currency])})</span>
            </p>
            <div className="flex gap-1.5 text-xs pt-1">
              {(['PENDING', 'KITCHEN', 'SERVED', 'CANCELLED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(o.id, s)}
                  className={`px-2 py-1 rounded-full ${o.status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
