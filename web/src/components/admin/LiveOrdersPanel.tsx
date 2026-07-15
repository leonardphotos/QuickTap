import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { Check, ChefHat, Plus, Truck, X } from 'lucide-react';
import { api, getToken } from '@/api/client';
import type { DeliveryCourier, Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useAuth } from '@/context/AuthContext';

interface LiveOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  unitPrice: string;
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
  customerPhone: string | null;
  customerAddress: string | null;
  customerNote: string | null;
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

const CHANNEL_TABS: { value: LiveOrder['channel']; label: string }[] = [
  { value: 'DINE_IN', label: 'Mesas' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'PICKUP', label: 'Pick-up' },
];

/** Panel "Pedidos": todos los pedidos activos con Aceptar/Cancelar/Finalizar/Delivery. Va en el Dashboard. */
export function LiveOrdersPanel() {
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<LiveOrder['channel'] | null>(null);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);

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

  // Mientras el diálogo de edición está abierto, lo refresca con los datos frescos que lleguen.
  useEffect(() => {
    if (!editingOrder || !orders) return;
    const fresh = orders.find((o) => o.id === editingOrder.id);
    if (fresh) setEditingOrder(fresh);
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const visibleOrders = channelFilter ? (orders ?? []).filter((o) => o.channel === channelFilter) : orders;

  if (!orders) return null;

  return (
    <div className="w-full max-w-md mb-8">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold text-brand-950">Pedidos</h2>
          {orders.length > 0 && (
            <span className="text-sm bg-brand-500 text-white rounded-full h-7 min-w-7 px-2 flex items-center justify-center font-bold">
              {orders.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {CHANNEL_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setChannelFilter((c) => (c === t.value ? null : t.value))}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                channelFilter === t.value ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3 text-left">{error}</p>}

      {visibleOrders?.length === 0 ? (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-6 text-center">
          <p className="text-sm text-brand-950/40 font-light">No hay pedidos activos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders?.map((o) => (
            <div
              key={o.id}
              onClick={() => setEditingOrder(o)}
              className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-4 text-left cursor-pointer hover:shadow-md transition-shadow"
            >
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
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
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
                <div className="grid grid-cols-4 gap-1.5" onClick={(e) => e.stopPropagation()}>
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

      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onSaved={load} />
      )}
    </div>
  );
}

function EditOrderDialog({ order, onClose, onSaved }: { order: LiveOrder; onClose: () => void; onSaved: () => void }) {
  const { restaurant } = useAuth();
  const [name, setName] = useState(order.customerName ?? '');
  const [phone, setPhone] = useState(order.customerPhone ?? '');
  const [address, setAddress] = useState(order.customerAddress ?? '');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState(order.customerNote ?? '');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [addingProductId, setAddingProductId] = useState('');
  const [addingQty, setAddingQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  const total = useMemo(
    () => order.items.reduce((acc, it) => acc + Number(it.unitPrice) * it.quantity, 0),
    [order.items],
  );

  async function saveCustomer() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/orders/${order.id}/customer`, {
        customerName: name.trim() || undefined,
        customerPhone: phone.trim() || undefined,
        customerAddress: address.trim() || undefined,
        customerNote: note.trim() || undefined,
        customerLat: addressCoords?.lat,
        customerLng: addressCoords?.lng,
      });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  }

  async function setQty(orderItemId: string, quantity: number) {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/orders/${order.id}/items`, { items: [{ orderItemId, quantity: Math.max(0, quantity) }] });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo actualizar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function addProduct() {
    if (!addingProductId) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/items`, {
        productId: addingProductId,
        quantity: Number(addingQty) || 1,
      });
      setAddingProductId('');
      setAddingQty('1');
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo añadir el producto.');
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
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {order.channel !== 'DINE_IN' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-brand-950">Datos del cliente</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Teléfono"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              />
              {order.channel === 'DELIVERY' && (
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(s) => {
                    setAddress(s.displayName);
                    setAddressCoords({ lat: s.lat, lng: s.lng });
                  }}
                  biasLat={restaurant?.deliveryOriginLat}
                  biasLng={restaurant?.deliveryOriginLng}
                  placeholder="Dirección"
                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                />
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional)"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              />
              <TextureButton variant="minimal" size="sm" className="!w-auto px-4" disabled={saving} onClick={saveCustomer}>
                Guardar datos del cliente
              </TextureButton>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-brand-950/10">
            <p className="text-sm font-semibold text-brand-950">Productos</p>
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">{it.productName}</p>
                    <p className="text-xs text-brand-950/50">{it.unitPrice} c/u</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setQty(it.id, it.quantity - 1)}
                      disabled={saving}
                      className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-medium">{it.quantity}</span>
                    <button
                      onClick={() => setQty(it.id, it.quantity + 1)}
                      disabled={saving}
                      className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <select
                value={addingProductId}
                onChange={(e) => setAddingProductId(e.target.value)}
                className="flex-1 min-w-0 text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              >
                <option value="">Añadir producto…</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.price}
                  </option>
                ))}
              </select>
              <input
                value={addingQty}
                onChange={(e) => setAddingQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-14 text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 text-center"
              />
              <button
                onClick={addProduct}
                disabled={saving || !addingProductId}
                className="h-9 w-9 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40"
                aria-label="Añadir"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-brand-950/10">
            <span>Total</span>
            <span>
              {total.toFixed(2)} {order.currency}
            </span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
