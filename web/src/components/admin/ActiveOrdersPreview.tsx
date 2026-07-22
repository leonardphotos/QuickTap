import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { LiveOrder } from './LiveOrdersPanel';

const CHANNEL_LABEL: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Para llevar',
  BAR: 'Barra',
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  NEEDS_CONFIRMATION: { label: 'Nueva', bg: '#fbedd6', fg: '#8a5106' },
  PENDING: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  KITCHEN: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  SERVED: { label: 'Servido', bg: '#e3f5ec', fg: '#0f6e46' },
};

function timeAgo(iso: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return secs < 60 ? `hace ${secs}s` : `hace ${Math.floor(secs / 60)} min`;
}

interface Props {
  /** Toca una fila: cambia a la pestaña Comandas para ver/gestionar el pedido completo. */
  onNavigate: () => void;
}

/** Vista rápida de pedidos activos del mesero, debajo del mapa de mesas — sin botones de
 * acción (para eso está la pestaña Comandas), solo para tener un vistazo sin cambiar de pestaña. */
export function ActiveOrdersPreview({ onNavigate }: Props) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);

  function load() {
    api.get('/orders/live').then((res) => setOrders(res.data.data));
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

  // Mismo criterio de "me corresponde" que usa LiveOrdersPanel para el rol Mesero.
  const mine = (orders ?? []).filter((o) => {
    if (o.placedByUser?.id === user?.id) return true;
    if (o.acceptedByUserId === user?.id) return true;
    if (o.table?.assignedWaiterId) return o.table.assignedWaiterId === user?.id;
    return !o.placedByUser && !o.acceptedByUserId;
  });

  if (!orders || mine.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-brand-950">Comandas activas</h2>
        <p className="text-xs text-brand-950/50">{mine.length}</p>
      </div>
      <div className="flex flex-col gap-2">
        {mine.map((o) => {
          const meta = STATUS_META[o.status] ?? { label: o.status, bg: '#eef3fc', fg: 'var(--color-brand-950)' };
          const itemsSummary = o.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ');
          return (
            <button
              key={o.id}
              onClick={onNavigate}
              className="flex items-center gap-3 bg-white border border-brand-950/10 rounded-2xl px-3.5 py-3 text-left shadow-sm hover:shadow-md transition-shadow"
            >
              <div
                className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center font-semibold text-[13px] shrink-0"
                style={{ background: meta.bg, color: meta.fg }}
              >
                {o.channel === 'DINE_IN' && o.table ? o.table.number : '—'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-brand-950">
                  {CHANNEL_LABEL[o.channel]}
                  <span
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: meta.bg, color: meta.fg }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-[11.5px] text-brand-950/50 truncate mt-0.5">
                  {itemsSummary || 'Sin productos'} · {timeAgo(o.createdAt)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
