import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { Check, ChefHat, Truck, X } from 'lucide-react';
import { api, getToken } from '@/api/client';
import type { DeliveryCourier } from '@/types';

interface LiveOrderItem {
  id: string;
  productName: string;
  quantity: number;
  modifiers: string[];
  note?: string | null;
}

interface LiveOrder {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP';
  status: string;
  totalBase: string;
  totalBs: string;
  currency: string;
  customerName: string | null;
  table: { number: string } | null;
  items: LiveOrderItem[];
}

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
};

const STATUS_LABELS: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
};

/** Panel "Pedidos": todos los pedidos activos con Aceptar/Cancelar/Finalizar/Delivery. Va en el Dashboard. */
export function LiveOrdersPanel() {
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/orders/live').then((res) => setOrders(res.data.data));
  }

  useEffect(() => {
    load();
    api.get('/delivery-couriers').then((res) => setCouriers(res.data.data));

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  async function accept(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/orders/${id}/accept`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo aceptar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm('¿Cancelar este pedido? No quedará registrado en el sistema.')) return;
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/orders/${id}`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cancelar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  async function finish(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/orders/${id}/status`, { status: 'SERVED' });
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo finalizar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  async function dispatch(orderId: string, courierId: string) {
    setBusyId(orderId);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${orderId}/dispatch-courier`, { courierId });
      window.open(data.data.url, '_blank');
      setCourierPickerFor(null);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo despachar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  function handleDeliveryClick(order: LiveOrder) {
    if (couriers.length === 0) {
      setError('Agrega un repartidor en Ajustes → Equipo de Delivery primero.');
      return;
    }
    if (couriers.length === 1) {
      dispatch(order.id, couriers[0].id);
      return;
    }
    setCourierPickerFor(order.id);
  }

  if (!orders) return null;

  return (
    <div className="w-full max-w-md mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-brand-950">Pedidos</h2>
        {orders.length > 0 && (
          <span className="text-xs bg-brand-500 text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center font-semibold">
            {orders.length}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3 text-left">{error}</p>}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-6 text-center">
          <p className="text-sm text-brand-950/40 font-light">No hay pedidos activos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-4 text-left">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="font-semibold text-brand-950">
                  #{o.orderNumber}
                  {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                </p>
                <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full shrink-0">
                  {CHANNEL_LABELS[o.channel]}
                  {o.table && ` ${o.table.number}`}
                </span>
              </div>

              <p className="text-xs text-brand-950/50 font-light mb-2">{STATUS_LABELS[o.status] ?? o.status}</p>

              <ul className="text-sm space-y-0.5 font-light mb-2">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                  </li>
                ))}
              </ul>

              <p className="text-sm font-semibold text-brand-950 mb-3">
                {o.totalBase} {o.currency}
              </p>

              {courierPickerFor === o.id ? (
                <div className="space-y-2">
                  <p className="text-xs text-brand-950/60">Elige el repartidor:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {couriers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => dispatch(o.id, c.id)}
                        disabled={busyId === o.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 disabled:opacity-50"
                      >
                        {c.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setCourierPickerFor(null)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full text-brand-950/50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => accept(o.id)}
                    disabled={busyId === o.id || (o.status !== 'PENDING' && o.status !== 'NEEDS_CONFIRMATION')}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium py-3 transition-colors disabled:opacity-40"
                  >
                    <Check className="h-5 w-5" /> Aceptar
                  </button>
                  <button
                    onClick={() => cancel(o.id)}
                    disabled={busyId === o.id}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-3 transition-colors disabled:opacity-50"
                  >
                    <X className="h-5 w-5" /> Cancelar
                  </button>
                  <button
                    onClick={() => finish(o.id)}
                    disabled={busyId === o.id}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-medium py-3 transition-colors disabled:opacity-50"
                  >
                    <ChefHat className="h-5 w-5" /> Finalizar
                  </button>
                  <button
                    onClick={() => handleDeliveryClick(o)}
                    disabled={busyId === o.id || o.channel !== 'DELIVERY'}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-950 hover:bg-brand-900 text-white text-xs font-medium py-3 transition-colors disabled:opacity-40"
                  >
                    <Truck className="h-5 w-5" /> Delivery
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
