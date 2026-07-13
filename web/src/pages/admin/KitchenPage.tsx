import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { Check } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { OrderView } from '../../types';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import {
  Expandable,
  ExpandableTrigger,
  ExpandableContent,
} from '@/components/ui/expandable';

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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Cola de Cocina</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}>
          {connected ? '● En vivo' : '○ Conectando…'}
        </span>
      </div>

      {orders.length === 0 && (
        <p className="text-sm text-brand-950/40 py-10 text-center font-light">No hay comandas pendientes.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((o) => (
          <TextureCard key={o.id} className="transition-shadow duration-300 hover:shadow-md">
            <TextureCardContent className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-brand-950 truncate">
                  #{o.orderNumber}
                  {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                </p>
                <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full shrink-0">
                  {o.channel === 'DINE_IN' ? `Mesa ${o.table?.number ?? ''}` : o.channel}
                </span>
              </div>
              <ul className="text-sm space-y-1 font-light">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.join(', ')})</span>
                    )}
                    {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setStatus(o.id, 'SERVED')}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2 transition-colors"
              >
                <Check className="h-4 w-4" /> Listo
              </button>

              <Expandable transitionDuration={0.25}>
                {({ isExpanded }) => (
                  <>
                    <ExpandableTrigger>
                      <p className="text-xs font-medium text-brand-500 pt-1">
                        {isExpanded ? 'Ocultar estado ▴' : `Estado: ${STATUS_LABEL[o.status]} ▾`}
                      </p>
                    </ExpandableTrigger>
                    <ExpandableContent preset="slide-down" keepMounted>
                      <div className="flex gap-1.5 text-xs pt-2 flex-wrap">
                        {(['PENDING', 'KITCHEN', 'SERVED', 'CANCELLED'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatus(o.id, s)}
                            className={`px-2 py-1 rounded-full ${o.status === s ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'}`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </ExpandableContent>
                  </>
                )}
              </Expandable>
            </TextureCardContent>
          </TextureCard>
        ))}
      </div>
    </div>
  );
}
