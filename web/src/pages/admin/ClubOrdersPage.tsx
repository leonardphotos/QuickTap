import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Check, ChefHat, Clock, Phone, Users } from 'lucide-react';
import { clubLinkApi, type KitchenClubOrder } from '@/api/clubLink';
import { getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import { formatBase } from '@/utils/format';
import { cn } from '@/lib/utils';

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
}

/**
 * Pedidos que llegan desde las canchas de los clubes vinculados (Ajustes →
 * Vincular canchas). El nombre de la cancha hace de mesa: es la única pista de a
 * dónde hay que llevar los productos.
 *
 * Acá no se cobra nada. El consumo se le suma al jugador en su reserva y lo
 * cobra el club en su propia Caja — a este restaurante le llega la comanda para
 * preparar y llevar, no una venta.
 */
export default function ClubOrdersPage() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState<KitchenClubOrder[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    clubLinkApi
      .orders()
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    load();
    const socket = io('/', { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('club:tab-order-new', load);
    socket.on('club:tab-order-updated', load);
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function setStatus(id: string, status: 'PREPARING' | 'DELIVERED' | 'CANCELLED') {
    setBusyId(id);
    try {
      await clubLinkApi.setOrderStatus(id, status);
      load();
    } finally {
      setBusyId(null);
    }
  }

  const money = (v: string) => formatBase(Number(v), restaurant?.currencySymbol ?? '$');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-brand-950">Canchas</h1>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-bold',
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-950/[0.06] text-brand-950/45',
          )}
        >
          {connected ? '● En vivo' : 'Sin conexión'}
        </span>
      </div>

      {orders === null && <p className="font-light text-brand-950/40">Cargando…</p>}

      {orders?.length === 0 && (
        <TextureCard>
          <TextureCardContent className="py-10 text-center">
            <p className="font-semibold text-brand-950">No hay pedidos de canchas ahora</p>
            <p className="mt-1 text-sm font-light text-brand-950/50">
              Cuando un jugador pida desde la tablet de su cancha, la comanda aparece acá al instante.
            </p>
          </TextureCardContent>
        </TextureCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orders?.map((o) => (
          <TextureCard key={o.id}>
            <TextureCardContent className="space-y-3 py-4">
              {/* La cancha es lo más grande de la tarjeta a propósito: es el dato
                  que usa quien lleva la bandeja. */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold leading-tight text-brand-950">{o.courtName}</p>
                  <p className="truncate text-xs font-light text-brand-950/45">{o.club.name}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                    o.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-brand-950 text-white',
                  )}
                >
                  {o.status === 'PENDING' ? 'Nuevo' : 'En preparación'}
                </span>
              </div>

              <div className="rounded-2xl bg-brand-950/[0.04] px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-brand-950">{o.player.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] font-light text-brand-950/55">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {o.player.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {o.player.count}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    hasta {hhmm(o.player.endsAt)}
                  </span>
                </div>
              </div>

              <ul className="space-y-1">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-brand-950">
                      <span className="font-bold">{i.quantity}×</span> {i.productName}
                    </span>
                    <span className="shrink-0 font-light text-brand-950/45">{money(i.unitPrice)}</span>
                  </li>
                ))}
              </ul>

              {o.clubItemCount > 0 && (
                <p className="text-[11px] font-light text-brand-950/40">
                  + {o.clubItemCount} {o.clubItemCount === 1 ? 'artículo' : 'artículos'} de la tienda del club (lo
                  despacha el club)
                </p>
              )}

              <p className="text-[11px] font-light text-brand-950/40">
                Pedido {hhmm(o.createdAt)} · lo cobra el club en su caja
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {o.status === 'PENDING' ? (
                  <button
                    onClick={() => setStatus(o.id, 'PREPARING')}
                    disabled={busyId === o.id}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-950/15 py-2.5 text-xs font-semibold text-brand-950/70 transition-colors hover:bg-brand-950/[0.03] disabled:opacity-40"
                  >
                    <ChefHat className="h-4 w-4" /> Preparando
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(o.id, 'CANCELLED')}
                    disabled={busyId === o.id}
                    className="rounded-xl border border-brand-950/15 py-2.5 text-xs font-medium text-brand-950/50 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => setStatus(o.id, 'DELIVERED')}
                  disabled={busyId === o.id}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-950/90 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" /> Entregado
                </button>
              </div>
            </TextureCardContent>
          </TextureCard>
        ))}
      </div>
    </div>
  );
}
