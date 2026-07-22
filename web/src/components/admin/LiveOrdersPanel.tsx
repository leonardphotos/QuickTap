import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Download,
  MessageCircle,
  Plus,
  Printer,
  SplitSquareHorizontal,
  Truck,
  X,
} from 'lucide-react';
import { api, getToken } from '@/api/client';
import type { DeliveryCourier, Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { CreateOrderDialog } from './CreateOrderDialog';
import { PaymentDialog } from './PaymentDialog';
import { ComandaReceipt } from './ComandaReceipt';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';

interface LiveOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  variantName?: string | null;
  unitPrice: string;
  quantity: number;
  modifiers: { name: string; priceBase: string }[];
  note?: string | null;
}

export interface LiveOrderPayment {
  id: string;
  amountBase: string;
  method: string;
  discountBase?: string | null;
  createdAt: string;
}

export interface LiveOrder {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
  status: string;
  subtotalBase: string;
  serviceChargeBase: string;
  ivaBase: string;
  deliveryFeeBase: string;
  tipBase: string;
  totalBase: string;
  totalBs: string;
  exchangeRate: string;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerIdNumber: string | null;
  customerNote: string | null;
  createdAt: string;
  table: { number: string; assignedWaiterId: string | null } | null;
  placedByUser: { id: string; name: string } | null;
  acceptedByUserId: string | null;
  items: LiveOrderItem[];
  payments: LiveOrderPayment[];
  awaitingPayment: boolean;
}

type ChannelFilter = LiveOrder['channel'] | 'AWAITING_PAYMENT' | 'PAID' | 'PARTIAL';

/** Estado de pago de un pedido, para colorear la tarjeta y filtrar el Dashboard. */
function getPaymentStatus(o: LiveOrder) {
  // Un descuento perdona esa parte de la deuda: cuenta como "saldado" igual que el efectivo cobrado.
  const paidBase = o.payments.reduce((acc, p) => acc + Number(p.amountBase) + Number(p.discountBase ?? 0), 0);
  const balanceBase = Math.max(0, Number(o.totalBase) - paidBase);
  const owesBalance = paidBase > 0 && balanceBase > 0.01;
  const fullyPaid = o.payments.length > 0 && balanceBase <= 0.01;
  return { paidBase, balanceBase, owesBalance, fullyPaid };
}

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Navega la pestaña abierta con `window.open('', '_blank')` a `url` (WhatsApp,
 * despacho de repartidor). En móvil, wa.me le entrega el control a la app de
 * WhatsApp de inmediato: la pestaña del navegador nunca llega a mostrar nada
 * y queda pegada en "about:blank" hasta que el usuario la cierra a mano. La
 * cerramos nosotros solos un instante después para que no quede esa pestaña
 * vacía y el foco regrese de una vez al panel. En escritorio la dejamos
 * abierta (ahí sí hace falta, ej. para apretar "Enviar" en WhatsApp Web).
 */
function openInTabAndAutoClose(win: Window | null, url: string) {
  if (!win) {
    window.location.href = url;
    return;
  }
  win.location.href = url;
  if (isMobileDevice()) {
    setTimeout(() => {
      try {
        win.close();
      } catch {
        // Nada que hacer: algunos navegadores no dejan cerrar pestañas con las que el usuario ya interactuó.
      }
    }, 1200);
  }
}

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
};

const STATUS_LABELS: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
};

/** Badge/chip de estado del pedido en la tarjeta — mismos tokens de color en toda la app. */
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  NEEDS_CONFIRMATION: { label: 'Nueva', bg: '#fbedd6', fg: '#8a5106' },
  PENDING: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  KITCHEN: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  SERVED: { label: 'Servido', bg: '#e3f5ec', fg: '#0f6e46' },
  CANCELLED: { label: 'Cancelado', bg: '#f1f4f9', fg: '#5b6785' },
};

const CHANNEL_TABS: { value: LiveOrder['channel']; label: string }[] = [
  { value: 'DINE_IN', label: 'Mesas' },
  { value: 'BAR', label: 'Barra' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'PICKUP', label: 'Pick-up' },
];

/** Panel "Pedidos": todos los pedidos activos con Aceptar/Cancelar/Finalizar/Delivery. Va en el Dashboard. */
interface Props {
  /** Dashboard del Mesero: al elegir "Pagar" en Órdenes de Mesa, se cambia a esta pestaña
   * con el id del pedido — abre aquí mismo el diálogo de pago (completo/fraccionado/deuda). */
  autoOpenPaymentOrderId?: string | null;
  onAutoOpenHandled?: () => void;
}

export function LiveOrdersPanel({ autoOpenPaymentOrderId, onAutoOpenHandled }: Props = {}) {
  const { restaurant, user } = useAuth();
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter | null>(null);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [justAdded, setJustAdded] = useState<{ id: string; fading: boolean } | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  // Una sola columna con texto en celular; en pantallas anchas siempre cuadrícula
  // compacta (solo iconos) para aprovechar el espacio — ya no es una opción manual.
  const actionBtnClass = 'text-xs font-medium py-3 lg:text-[10.5px] lg:py-2.5 lg:px-0.5 lg:leading-tight';

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

  // Igual, mientras el diálogo de pago está abierto (para reflejar el saldo tras cada abono).
  useEffect(() => {
    if (!paymentDialog || !orders) return;
    const fresh = orders.find((o) => o.id === paymentDialog.order.id);
    if (fresh) setPaymentDialog((d) => (d ? { ...d, order: fresh } : d));
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoOpenPaymentOrderId || !orders) return;
    const found = orders.find((o) => o.id === autoOpenPaymentOrderId);
    if (found) {
      setPaymentDialog({ order: found, mode: 'full' });
      onAutoOpenHandled?.();
    }
  }, [orders, autoOpenPaymentOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function toggleAwaitingPayment(id: string, awaitingPayment: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/orders/${id}/awaiting-payment`, { awaitingPayment });
      load();
      if (awaitingPayment) {
        setJustAdded({ id, fading: false });
        setTimeout(() => setJustAdded((j) => (j && j.id === id ? { ...j, fading: true } : j)), 1200);
        setTimeout(() => setJustAdded((j) => (j && j.id === id ? null : j)), 1700);
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo actualizar la cuenta por pagar.');
    } finally {
      setBusyId(null);
    }
  }

  async function dispatch(orderId: string, courierId: string) {
    // Mismo motivo que sendWhatsapp(): abrir la pestaña antes del await para
    // no perder el gesto del clic y que el navegador bloquee el popup.
    const win = window.open('', '_blank');
    setBusyId(orderId);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${orderId}/dispatch-courier`, { courierId });
      openInTabAndAutoClose(win, data.data.url);
      setCourierPickerFor(null);
    } catch (e: any) {
      win?.close();
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

  // El rol Mesero solo ve: los pedidos que él mismo tomó (placedByUser), los
  // que ya aceptó de un cliente que pidió desde su mesa (acceptedByUserId),
  // los de una mesa que tiene asignada (Equipo → "Asignar mesas", o porque él
  // fue quien aceptó el primer pedido de esa mesa), y los que un cliente pidió
  // desde una mesa sin dueño y todavía nadie aceptó (para poder tomarlos). En
  // cuanto la mesa queda asignada a otro mesero, deja de aparecerle.
  // El resto de los roles (Admin, Cajero, Cocina, Pantalla) ve todos.
  const roleFiltered =
    user?.role === 'WAITER'
      ? (orders ?? []).filter((o) => {
          if (o.placedByUser?.id === user.id) return true;
          if (o.acceptedByUserId === user.id) return true;
          if (o.table?.assignedWaiterId) return o.table.assignedWaiterId === user.id;
          return !o.placedByUser && !o.acceptedByUserId;
        })
      : orders;

  const visibleOrders = !channelFilter
    ? roleFiltered
    : channelFilter === 'AWAITING_PAYMENT'
      ? (roleFiltered ?? []).filter((o) => o.awaitingPayment)
      : channelFilter === 'PAID'
        ? (roleFiltered ?? []).filter((o) => getPaymentStatus(o).fullyPaid)
        : channelFilter === 'PARTIAL'
          ? (roleFiltered ?? []).filter((o) => getPaymentStatus(o).owesBalance)
          : (roleFiltered ?? []).filter((o) => o.channel === channelFilter);

  if (!orders) return null;

  const filterOptions: { value: ChannelFilter | null; label: string }[] = [
    { value: null, label: 'Todos' },
    ...CHANNEL_TABS,
    ...(canAccountsPayable ? [{ value: 'AWAITING_PAYMENT' as const, label: 'Deudas' }] : []),
    { value: 'PAID', label: 'Pagados' },
    { value: 'PARTIAL', label: 'Fraccionado' },
  ];

  return (
    <div className="w-full mb-8 max-w-md mx-auto lg:max-w-none lg:mx-0">
      <div className="grid grid-cols-3 items-center mb-3 gap-2">
        <div className="flex items-center gap-2.5 justify-self-start">
          <h2 className="text-lg font-semibold text-brand-950">Pedidos</h2>
          {(roleFiltered?.length ?? 0) > 0 && (
            <span className="text-sm bg-brand-500 text-white rounded-full h-7 min-w-7 px-2 flex items-center justify-center font-bold">
              {roleFiltered?.length}
            </span>
          )}
        </div>
        <TextureButton
          variant="brand"
          size="icon"
          className="!w-14 !h-14 justify-self-center"
          onClick={() => setCreateOrderOpen(true)}
          aria-label="Crear pedido"
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </TextureButton>
        <div className="justify-self-end" />
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
        {filterOptions.map((f) => (
          <button
            key={f.label}
            onClick={() => setChannelFilter(f.value)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              channelFilter === f.value
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-brand-950/60 border-brand-950/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3 text-left">{error}</p>}

      {visibleOrders?.length === 0 ? (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-6 text-center">
          <p className="text-sm text-brand-950/40 font-light">No hay pedidos activos.</p>
        </div>
      ) : (
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-3 lg:items-start">
          {visibleOrders?.map((o) => {
            const { balanceBase, owesBalance, fullyPaid } = getPaymentStatus(o);
            return (
            <div
              key={o.id}
              onClick={() => setEditingOrder(o)}
              className={`relative rounded-2xl border shadow-sm p-4 text-left cursor-pointer hover:shadow-md transition-shadow ${
                fullyPaid ? 'border-emerald-300 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'
              }`}
            >
              {justAdded?.id === o.id && (
                <div
                  className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-brand-950/85 text-white text-sm font-medium text-center px-4 transition-opacity duration-500 ${
                    justAdded.fading ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  Añadido a cuentas por pagar
                </div>
              )}
              {(() => {
                const statusMeta = STATUS_META[o.status] ?? { label: STATUS_LABELS[o.status] ?? o.status, bg: '#eef3fc', fg: 'var(--color-brand-950)' };
                return (
                  <div className="flex items-start gap-3 mb-2">
                    <div
                      className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center font-semibold text-[13px] shrink-0"
                      style={{ background: statusMeta.bg, color: statusMeta.fg }}
                    >
                      {o.channel === 'DINE_IN' && o.table ? o.table.number : '—'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-950 flex items-center gap-1.5 flex-wrap">
                        {CHANNEL_LABELS[o.channel]}
                        {o.table && ` ${o.table.number}`}
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: statusMeta.bg, color: statusMeta.fg }}
                        >
                          {statusMeta.label}
                        </span>
                        {o.awaitingPayment && <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      </p>
                      <p className="text-xs text-brand-950/50 font-light truncate">
                        #{o.orderNumber}
                        {o.customerName && ` · ${o.customerName}`}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <ul className="text-sm space-y-0.5 font-light mb-2">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.map((m) => m.name).join(', ')})</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <p className="text-sm font-semibold text-brand-950">{formatBase(o.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50">{formatBsAbsolute(o.totalBs)}</p>
                {owesBalance && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    Debe {formatBase(balanceBase, symbol)}
                  </span>
                )}
              </div>

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
                <div className={`grid ${canAccountsPayable ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5`} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => accept(o.id)}
                    disabled={busyId === o.id || (o.status !== 'PENDING' && o.status !== 'NEEDS_CONFIRMATION')}
                    title="Aceptar"
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white ${actionBtnClass} transition-colors disabled:opacity-40`}
                  >
                    <Check className="h-4 w-4" /> <span className="lg:hidden">Aceptar</span>
                  </button>
                  <button
                    onClick={() => cancel(o.id)}
                    disabled={busyId === o.id}
                    title="Cancelar"
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-red-500 hover:bg-red-600 text-white ${actionBtnClass} transition-colors disabled:opacity-50`}
                  >
                    <X className="h-4 w-4" /> <span className="lg:hidden">Cancelar</span>
                  </button>
                  <button
                    onClick={() => finish(o.id)}
                    disabled={busyId === o.id}
                    title="Finalizar"
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-500 hover:bg-brand-400 text-white ${actionBtnClass} transition-colors disabled:opacity-50`}
                  >
                    <ChefHat className="h-4 w-4" /> <span className="lg:hidden">Finalizar</span>
                  </button>
                  <button
                    onClick={() => handleDeliveryClick(o)}
                    disabled={busyId === o.id || o.channel !== 'DELIVERY'}
                    title="Delivery"
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-950 hover:bg-brand-900 text-white ${actionBtnClass} transition-colors disabled:opacity-40`}
                  >
                    <Truck className="h-4 w-4" /> <span className="lg:hidden">Delivery</span>
                  </button>
                  {canAccountsPayable && (
                    <button
                      onClick={() => toggleAwaitingPayment(o.id, !o.awaitingPayment)}
                      disabled={busyId === o.id}
                      title={o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl text-white ${actionBtnClass} transition-colors disabled:opacity-40 ${
                        o.awaitingPayment ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                    >
                      <Clock className="h-4 w-4" /> <span className="lg:hidden">{o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}</span>
                    </button>
                  )}
                </div>
              )}

              {fullyPaid ? (
                <p className="text-xs text-emerald-600 font-medium text-center mt-2">✓ Pagado</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'full' })}
                    title="Pagar"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
                  >
                    <CreditCard className="h-4 w-4" /> <span className="lg:hidden">Pagar</span>
                  </button>
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'split' })}
                    title="Pago fraccionado"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
                  >
                    <SplitSquareHorizontal className="h-4 w-4" /> <span className="lg:hidden">Pago fraccionado</span>
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onSaved={load} />
      )}

      {createOrderOpen && (
        <CreateOrderDialog
          existingOrders={orders}
          onClose={() => setCreateOrderOpen(false)}
          onCreated={(newOrder, paymentMode) => {
            load();
            if (newOrder && paymentMode) setPaymentDialog({ order: newOrder, mode: paymentMode });
          }}
          onSelectExisting={(orderId) => {
            setCreateOrderOpen(false);
            const target = orders.find((o) => o.id === orderId);
            if (target) setEditingOrder(target);
          }}
        />
      )}

      {paymentDialog && (
        <PaymentDialog
          order={paymentDialog.order}
          mode={paymentDialog.mode}
          onClose={() => setPaymentDialog(null)}
          onPaid={load}
        />
      )}
    </div>
  );
}

export function EditOrderDialog({ order, onClose, onSaved }: { order: LiveOrder; onClose: () => void; onSaved: () => void }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
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
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  /** Botón "Imprimir": no imprime desde este navegador — reenvía la comanda a la
   * estación de impresión (print-station), que es quien tiene las impresoras conectadas. */
  async function printComanda() {
    setPrinting(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/print-comanda`);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda a la estación de impresión.');
    } finally {
      setPrinting(false);
    }
  }

  async function downloadJpg() {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      // Import dinámico: html2canvas pesa bastante, no tiene sentido que cargue
      // en cada visita a Pedidos si nunca se descarga una comanda.
      const { downloadElementAsJpg } = await import('@/utils/pdf');
      await downloadElementAsJpg(receiptRef.current, `comanda-${order.orderNumber}.jpg`);
    } finally {
      setDownloading(false);
    }
  }

  async function sendWhatsapp() {
    // Abrir la pestaña ANTES del await, dentro del gesto síncrono del clic:
    // si se abre después de esperar la respuesta del servidor, el navegador
    // pierde el contexto de "acción del usuario" y bloquea el popup en
    // silencio (sin lanzar error, sin avisar).
    const win = window.open('', '_blank');
    setSendingWhatsapp(true);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${order.id}/send-whatsapp`);
      openInTabAndAutoClose(win, data.data.url);
    } catch (e: any) {
      win?.close();
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda por WhatsApp.');
    } finally {
      setSendingWhatsapp(false);
    }
  }

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
              <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={saving} onClick={saveCustomer}>
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
                    <p className="text-sm font-medium text-brand-950 truncate">
                      {it.productName}
                      {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    </p>
                    {it.modifiers.length > 0 && (
                      <p className="text-xs text-brand-950/50 truncate">{it.modifiers.map((m) => m.name).join(', ')}</p>
                    )}
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

          <div className="text-xs text-brand-950/60 space-y-1 pt-2 border-t border-brand-950/10">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatBase(order.subtotalBase, symbol)}</span>
            </div>
            {Number(order.serviceChargeBase) > 0 && (
              <div className="flex justify-between">
                <span>Servicio</span>
                <span>{formatBase(order.serviceChargeBase, symbol)}</span>
              </div>
            )}
            {Number(order.ivaBase) > 0 && (
              <div className="flex justify-between">
                <span>IVA</span>
                <span>{formatBase(order.ivaBase, symbol)}</span>
              </div>
            )}
            {Number(order.deliveryFeeBase) > 0 && (
              <div className="flex justify-between">
                <span>Envío</span>
                <span>{formatBase(order.deliveryFeeBase, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-sm text-brand-950 pt-1">
              <span>Total</span>
              <span>{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalente en Bs</span>
              <span>{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={printing} onClick={printComanda}>
              <Printer className="h-3.5 w-3.5" /> {printing ? 'Enviando…' : 'Imprimir'}
            </TextureButton>
            <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloading} onClick={downloadJpg}>
              <Download className="h-3.5 w-3.5" /> {downloading ? 'Generando…' : 'Descargar'}
            </TextureButton>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto"
              disabled={sendingWhatsapp || !order.customerPhone}
              onClick={sendWhatsapp}
              title={order.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
            >
              <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsapp ? 'Enviando…' : 'Enviar vía WhatsApp'}
            </TextureButton>
          </div>
        </div>

        <div className="fixed -left-[9999px] top-0">
          <ComandaReceipt ref={receiptRef} order={order} restaurantName={restaurant?.name ?? ''} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
