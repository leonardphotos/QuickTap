import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { Check, Pencil, X } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { OrderView } from '../../types';
import { formatModifierLabel } from '../../utils/format';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderHistorySection } from '@/components/admin/OrderHistorySection';
import { CourierStatsSection } from '@/components/admin/CourierStatsSection';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';
import { hasFullAccess } from '@/utils/roles';

const TABS = [
  { id: 'live', label: 'En curso' },
  { id: 'couriers', label: 'Repartidores' },
  { id: 'history', label: 'Historial de pedidos' },
] as const;
type DeliveryTabId = (typeof TABS)[number]['id'];

export default function DeliveryPage() {
  const { restaurant, user } = useAuth();
  // Repartidores e historial son datos administrativos: solo para quien ya ve Administración.
  const canManage = hasFullAccess(user?.role, user?.cashierFullAccess);
  const [tab, setTab] = useState<DeliveryTabId>('live');
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [connected, setConnected] = useState(false);
  const [editing, setEditing] = useState<OrderView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api.get('/orders/delivery').then((res) => setOrders(res.data.data));
  }

  useEffect(() => {
    load();

    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', () => load());
    socket.on('order:updated', () => load());

    return () => {
      socket.disconnect();
    };
  }, []);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await api.patch(`/orders/${id}/status`, { status });
      load();
    } finally {
      setBusyId(null);
    }
  }

  function cancelOrder(id: string) {
    if (!confirm('¿Cancelar este pedido?')) return;
    setStatus(id, 'CANCELLED');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Delivery</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}>
          {connected ? '● En vivo' : '○ Conectando…'}
        </span>
      </div>

      {canManage && (
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  tab === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {canManage && tab === 'couriers' && <CourierStatsSection />}
      {canManage && tab === 'history' &&
        (hasFeature(restaurant, 'accounting') ? (
          <OrderHistorySection channels={['DELIVERY', 'PICKUP']} defaultRange="week" />
        ) : (
          <PlanUpgradeNotice feature="El historial de pedidos" />
        ))}

      {tab === 'live' && orders.length === 0 && (
        <p className="text-sm text-brand-950/40 py-10 text-center font-light">No hay pedidos de delivery/pickup pendientes.</p>
      )}

      <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${tab === 'live' ? '' : 'hidden'}`}>
        {orders.map((o) => (
          <TextureCard key={o.id} className="transition-shadow duration-300 hover:shadow-md">
            <TextureCardContent className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-brand-950 truncate">
                  #{o.orderNumber}
                  {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                </p>
                <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full shrink-0">
                  {o.channel === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                </span>
              </div>
              <ul className="text-sm space-y-1 font-light">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.map(formatModifierLabel).join(', ')})</span>
                    )}
                    {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold text-brand-950">{o.totalBase} {o.currency}</p>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setStatus(o.id, 'SERVED')}
                  disabled={busyId === o.id}
                  className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium py-2 transition-colors disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Listo
                </button>
                <button
                  onClick={() => setEditing(o)}
                  disabled={busyId === o.id}
                  className="flex items-center justify-center gap-1 rounded-xl bg-brand-950/[0.06] hover:bg-brand-950/10 text-brand-950 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  onClick={() => cancelOrder(o.id)}
                  disabled={busyId === o.id}
                  className="flex items-center justify-center gap-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-2 transition-colors disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
            </TextureCardContent>
          </TextureCard>
        ))}
      </div>

      {editing && (
        <EditOrderDialog
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order: OrderView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map((it) => [it.id, it.quantity])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => order.items.reduce((acc, it) => acc + Number(it.unitPrice) * (quantities[it.id] ?? 0), 0),
    [order.items, quantities],
  );

  function setQty(id: string, qty: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, qty) }));
  }

  async function save() {
    const items = Object.entries(quantities).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.every((i) => i.quantity === 0)) {
      setError('El pedido debe tener al menos un producto.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/orders/${order.id}/items`, { items });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el pedido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pedido #{order.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {order.items.map((it) => {
              const qty = quantities[it.id] ?? 0;
              return (
                <li key={it.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">{it.productName}</p>
                    <p className="text-xs text-brand-950/50">{it.unitPrice} c/u</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setQty(it.id, qty - 1)}
                      disabled={qty === 0}
                      className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-medium">{qty}</span>
                    <button
                      onClick={() => setQty(it.id, qty + 1)}
                      className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between text-sm font-semibold pt-1">
            <span>Nuevo total</span>
            <span>{total.toFixed(2)} {order.currency}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
