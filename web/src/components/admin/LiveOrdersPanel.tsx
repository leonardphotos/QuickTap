import { restoreModifierSelection } from '@/utils/order-modifier-selection';
import { FinalizeDeliveryButton } from './FinalizeDeliveryButton';
import { DeliveryPaymentPreference } from './DeliveryPaymentPreference';
import { OrderPaymentSummary } from './OrderPaymentSummary';
import { GroupedOrderItems } from './GroupedOrderItems';
import { productNeedsOptions } from '@/utils/productNeedsOptions';
import { OrderMenuCatalog } from './OrderMenuCatalog';
import { FindOrderCorrectionDialog } from './FindOrderCorrectionDialog';
import { api,getToken } from '@/api/client';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { CourierPickerDialog } from '@/components/admin/CourierPickerDialog';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext.shared';
import { useToast } from '@/hooks/useToast';
import type { CartLine,DeliveryCourier,Product } from '@/types';
import { apiOrigin } from '@/utils/apiOrigin';
import { abbreviateTableBadge,cartLineUnitPrice,CURRENCY_SYMBOLS,formatBase,formatBsAbsolute,formatModifierLabel } from '@/utils/format';
import { hasFeature } from '@/utils/subscription';
import { ORDER_CORRECTION_ROLES, canManageIncomingOrders } from '@/utils/roles';
import {
Check,
Bike,
Martini,
Store,
UtensilsCrossed,
Zap,
ChevronLeft,
CreditCard,
MapPin,
Phone,
Clock,
SplitSquareHorizontal,
Download,
History,
Pencil,
Plus,
Printer,
Receipt,
Search,
Truck,
Trash2,
X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback,useEffect,useRef,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { ComandaReceipt } from './ComandaReceipt';
import { OrderWhatsappButton } from './OrderWhatsappButton';
import { CreateOrderDialog } from './CreateOrderDialog';
import { OrderDraftsPanel, useOrderDrafts, type SavedOrderDraft } from './OrderDraftsPanel';
import { FiscalInvoiceDialog } from './FiscalInvoiceDialog';
import { getPaymentStatus,handleWhatsappSendResult,leCorresponde,type LiveOrder,type LiveOrderItem } from './LiveOrdersPanel.shared';
import { PaymentDialog } from './PaymentDialog';
import { OrderCorrectionPanel } from './OrderCorrectionPanel';
import { OrderRefundDialog } from './OrderRefundDialog';
import { ProductOptionsDialog } from './ProductOptionsDialog';

interface DeletionLogEntry {
  id: string;
  orderNumber: number;
  channel: string;
  status: string;
  tableName: string | null;
  customerName: string | null;
  totalBase: number;
  /** Cuánto se había cobrado ya cuando lo borraron. 0 = nadie había pagado nada. */
  paidBase: number;
  paidMethods?: { metodo: string; monto: number; referencia: string | null; cuando: string }[] | null;
  items: { name: string; quantity: number; variantName?: string | null; modifiers?: { name: string; quantity: number }[] }[];
  deletionReason: string | null;
  deletedByName: string;
  deletedByRole: string;
  deletedAt: string;
}

type ChannelFilter = LiveOrder['channel'] | 'NEW' | 'AWAITING_PAYMENT' | 'PAID' | 'PARTIAL';



/** Resumen "hace X min" para la tarjeta compacta de celular. */
/** Filtra comandas por nombre, cédula o teléfono del cliente. Ignora tildes/mayúsculas para
 * que "jose" encuentre "José"; el teléfono compara solo dígitos, para que buscar "04121234567"
 * encuentre un número guardado como "0412-123-4567". */
function filterByOrderSearch(orders: LiveOrder[], query: string): LiveOrder[] {
  const q = query.trim();
  if (!q) return orders;
  const qNormalized = q
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  return orders.filter((o) => {
    const name = (o.customerName ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (name.includes(qNormalized)) return true;
    if (qDigits && (o.customerPhone ?? '').replace(/\D/g, '').includes(qDigits)) return true;
    if (qDigits && (o.customerIdNumber ?? '').replace(/\D/g, '').includes(qDigits)) return true;
    return false;
  });
}

function timeAgo(iso: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return secs < 60 ? `hace ${secs}s` : `hace ${Math.floor(secs / 60)} min`;
}

/** Fecha y hora exactas del pedido, para la tarjeta de Comandas — junto al "hace X min" no
 * alcanza para saber si un pedido viejo quedó pendiente de ayer o de hace un rato. */
function exactDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CHANNEL_LABELS: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pickup',
  BAR: 'Barra',
  EXPRESS: 'Express',
};

const STATUS_LABELS: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  NEEDS_PAYMENT: 'Por cobrar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
};

/** Badge/chip de estado del pedido en la tarjeta — mismos tokens de color en toda la app. */
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  NEEDS_CONFIRMATION: { label: 'Por confirmar', bg: '#fff1d6', fg: '#854d0e' },
  // Pedido de kiosco (rol Comanda): espera que caja lo cobre antes de ir a cocina.
  NEEDS_PAYMENT: { label: 'Por cobrar · Autoservicio', bg: '#fbedd6', fg: '#8a5106' },
  PENDING: { label: 'Pendiente', bg: '#fff1d6', fg: '#854d0e' },
  KITCHEN: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  SERVED: { label: 'Servido', bg: '#e3f5ec', fg: '#0f6e46' },
  CANCELLED: { label: 'Cancelado', bg: '#fee2e2', fg: '#b91c1c' },
};

const CHANNEL_TABS: { value: LiveOrder['channel']; label: string; icon: typeof UtensilsCrossed }[] = [
  { value: 'DINE_IN', label: 'Mesas', icon: UtensilsCrossed },
  { value: 'BAR', label: 'Barra', icon: Martini },
  { value: 'EXPRESS', label: 'Express', icon: Zap },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'PICKUP', label: 'Pick-up', icon: Store },
];

interface LiveOrdersPanelProps {
  /** El dashboard de Mesero ya tiene su propio botón flotante "Crear pedido" (fijo abajo a la
   * izquierda, visible en todas sus pestañas) — se oculta este para no duplicarlo en Comandas. */
  hideCreateButton?: boolean;
  deliveryOnly?: boolean;
  /** Controles en una fila para el panel operativo de tablets horizontales. */
  compactLayout?: boolean;
  /** Permite abrir "Crear pedido" desde un botón de fuera (el Dashboard lo tiene arriba, sobre
   * "Ventas de hoy"). Si se pasa, el diálogo queda controlado por el padre; si no, se maneja acá. */
  createOrderOpen?: boolean;
  onCreateOrderOpenChange?: (open: boolean) => void;
}

/** Panel "Pedidos": todos los pedidos activos con Aceptar/Cancelar/Finalizar/Delivery. Va en el Dashboard. */
export function LiveOrdersPanel({
  hideCreateButton,
  deliveryOnly = false,
  createOrderOpen: controlledCreateOrderOpen,
  onCreateOrderOpenChange,
}: LiveOrdersPanelProps = {}) {
  const { restaurant, user } = useAuth();
  const drafts = useOrderDrafts();
  const [draftsTab, setDraftsTab] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<SavedOrderDraft | null>(null);
  const [freshDraft, setFreshDraft] = useState(false);
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const { show, toastMessage } = useToast();
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [pageInfo, setPageInfo] = useState<{ counts: Record<string, number>; total: number; page: number; deliveryStats?: { today: number; total: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const requestSequence = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter | null>(null);
  // Búsqueda transversal: permite localizar cualquier comanda sin saber primero su canal o
  // estado. Nombre ignora tildes; cédula y teléfono ignoran espacios, guiones y prefijos.
  const [orderSearch, setOrderSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(orderSearch); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [orderSearch]);
  const [correctionSearchOpen, setCorrectionSearchOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [uncontrolledCreateOrderOpen, setUncontrolledCreateOrderOpen] = useState(false);
  const createOrderOpen = controlledCreateOrderOpen ?? uncontrolledCreateOrderOpen;
  const setCreateOrderOpen = onCreateOrderOpenChange ?? setUncontrolledCreateOrderOpen;
  const [createOrders, setCreateOrders] = useState<LiveOrder[] | null>(null);
  useEffect(() => {
    if (!createOrderOpen) { setCreateOrders(null); return; }
    let cancelled = false;
    // El selector de cuentas existentes necesita TODAS, no solo la página visible.
    api.get('/orders/live', { params: { incluirPagadas: '1' } }).then(response => {
      if (!cancelled) setCreateOrders(response.data.data);
    }).catch(() => {
      if (!cancelled) { setError('No se pudieron cargar las cuentas existentes. Vuelve a abrir Crear pedido.'); setCreateOrderOpen(false); }
    });
    return () => { cancelled = true; };
  }, [createOrderOpen]);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiveOrder | null>(null);
  const [refundsOpen, setRefundsOpen] = useState(false);
  // Registro permanente de comandas eliminadas — solo Dueño/Admin (el backend además lo exige).
  const [deletionLogOpen, setDeletionLogOpen] = useState(false);
  const [deletionLog, setDeletionLog] = useState<DeletionLogEntry[] | null>(null);
  /**
   * Cuántas tarjetas se PINTAN de una. La lista nunca corta pedidos —un impago no puede
   * desaparecer (ver listLiveOrders)— pero pintar cientos de tarjetas de golpe traba un
   * teléfono de gama baja. En un local que no registra pagos son 443 pedidos abiertos; con
   * esto se pintan los primeros y el resto entra con el botón, con el total siempre a la vista.
   */
  const [tarjetasVisibles, setTarjetasVisibles] = useState(40);

  async function acceptFromCard(order: LiveOrder) {
    if (busyId) return;
    // Delivery/Pick-up no deben ir a cocina sin cobrar: el botón abre directamente
    // el cobro y la aceptación ocurre automáticamente al quedar saldados.
    if (!order.placedByUser && (order.channel === 'DELIVERY' || order.channel === 'PICKUP') && !getPaymentStatus(order).fullyPaid) {
      setPaymentDialog({ order, mode: 'full' });
      return;
    }
    setBusyId(order.id);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/accept`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo aceptar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  function rejectFromCard(order: LiveOrder) {
    if (!busyId) setDeleteTarget(order);
  }

  const requestedId = searchParams.get('order');
  const dialogOrderId = useRef<string | undefined>(undefined);
  dialogOrderId.current = editingOrder?.id ?? paymentDialog?.order.id;
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const { data } = await api.get('/orders/live', { params: { scope: deliveryOnly ? 'DELIVERY' : 'ALL', paginated: '1', incluirPagadas: '1', filter: channelFilter ?? 'ALL', search: debouncedSearch, page, orderId: requestedId ?? dialogOrderId.current } });
      if (sequence !== requestSequence.current) return;
      // Compatibilidad con la estación local/relay y servidores previos al despliegue.
      if (Array.isArray(data.data)) { setOrders(deliveryOnly ? data.data.filter((order: LiveOrder) => order.channel === 'DELIVERY') : data.data); setPageInfo(null); }
      else {
        setOrders(data.data.orders);
        setPageInfo({ counts: data.data.counts, total: data.data.total, page: data.data.page, deliveryStats: data.data.deliveryStats });
        const detail: LiveOrder | null = data.data.requestedOrder;
        if (detail) {
          if (requestedId) setEditingOrder(detail);
          else setEditingOrder(current => current?.id === detail.id ? detail : current);
          setPaymentDialog(current => current?.order.id === detail.id ? { ...current, order: detail } : current);
        }
      }
      setError(null);
    } catch {
      if (sequence === requestSequence.current) {
        setOrders(null);
        setError('No se pudieron cargar las comandas. Intenta de nuevo.');
      }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [deliveryOnly, channelFilter, debouncedSearch, page, requestedId, restaurant?.id, user?.id]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void load();
    return () => { requestSequence.current++; };
  }, [load]);

  /**
   * Recarga agrupada para los avisos del socket.
   *
   * Cada evento (`order:new`, `order:updated`) disparaba una recarga COMPLETA de la lista, y
   * esa lista no tiene corte por antigüedad a propósito: un pedido impago nunca desaparece
   * (ver listLiveOrders y el disparador trg_no_ocultar_cuentas_impagas). En un local que no
   * registra pagos eso son cientos de pedidos — medido en producción: 760 KB y 1,7 s por
   * llamada. Con una comanda entrando detrás de otra, el teléfono quedaba descargando y
   * repintando esa lista sin parar, que es justo lo que lo hace sentir trancado en gama baja.
   *
   * Agrupar no oculta nada: la recarga igual ocurre, una sola vez por ráfaga.
   */
  const recargaPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleLoad() {
    if (recargaPendiente.current) clearTimeout(recargaPendiente.current);
    recargaPendiente.current = setTimeout(() => {
      recargaPendiente.current = null;
      void loadRef.current();
    }, 700);
  }

  useEffect(() => {
    api.get('/delivery-couriers').then((res) => setCouriers(res.data.data));

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', scheduleLoad);
    socket.on('order:updated', scheduleLoad);
    // Cierre de caja: las comandas saldadas del turno salieron de la lista, así que
    // el panel abierto en otra pantalla no se queda mostrando el turno anterior.
    socket.on('orders:cleared', scheduleLoad);
    socket.on('payment-verification:timeout', () => {
      show('El verificador de pagos no respondió a tiempo — revisa el comprobante manualmente.');
    });

    return () => {
      socket.disconnect();
      if (recargaPendiente.current) clearTimeout(recargaPendiente.current);
    };
  }, [show]);

  // El aviso global abre la comanda exacta mediante ?order=<id>. Consumimos el parámetro
  // una sola vez para que cerrar el diálogo no lo vuelva a abrir al refrescar la lista.
  useEffect(() => {
    if (!orders || loading) return;
    const requestedOrderId = searchParams.get('order');
    if (!requestedOrderId) return;
    const requestedOrder = orders.find((candidate) => candidate.id === requestedOrderId);
    if (requestedOrder) {
      setChannelFilter(null);
      setEditingOrder(requestedOrder);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('order');
    setSearchParams(next, { replace: true });
  }, [orders, loading, searchParams, setSearchParams]);

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

  async function dispatch(orderId: string, courierId: string) {
    // Mismo motivo que sendWhatsapp(): abrir la pestaña antes del await para
    // no perder el gesto del clic y que el navegador bloquee el popup.
    const win = window.open('', '_blank');
    setBusyId(orderId);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${orderId}/dispatch-courier`, { courierId });
      handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
      setCourierPickerFor(null);
    } catch (e: any) {
      win?.close();
      setError(e.response?.data?.error ?? 'No se pudo despachar el pedido.');
    } finally {
      setBusyId(null);
    }
  }

  /**
   * "Despacho automático al cobrar" (Ajustes → Delivery). Corre justo después
   * de que una comanda de delivery queda saldada:
   *  - "Enviar automáticamente": el servidor elige repartidor por turnos y se
   *    abre su WhatsApp con la comanda.
   *  - "Abrir el equipo de delivery": solo abre la ventana para elegir a mano.
   * Nunca revienta el cobro, que ya se registró: un fallo acá solo se muestra
   * como aviso y el pedido queda despachable a mano desde la lista.
   */
  async function autoDispatchAfterPayment(order: LiveOrder) {
    if (order.channel !== 'DELIVERY') return;

    if (restaurant?.deliveryAutoAssignOnPaid) {
      // La pestaña se pide antes del await por el bloqueador de popups, igual
      // que en dispatch(). Si aun así la bloquea, openInTabAndAutoClose cae en
      // navegar la pestaña actual, así que el WhatsApp nunca se pierde.
      const win = window.open('', '_blank');
      try {
        const { data } = await api.post(`/orders/${order.id}/dispatch-courier`, {});
        if (data.data?.url || data.data?.sent || data.data?.assignedToApp) {
          handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
        } else {
          // Sin repartidores activos: el backend devuelve null en vez de fallar.
          win?.close();
          setError('El pedido se cobró, pero no hay repartidores activos para despacharlo.');
        }
      } catch (e: any) {
        win?.close();
        setError(e.response?.data?.error ?? 'El pedido se cobró, pero no se pudo despachar automáticamente.');
      }
      return;
    }

    if (restaurant?.deliveryAutoOpenOnPaid) handleDeliveryClick(order);
  }

  /** Siempre abre la ventana con todo el equipo de delivery para elegir, aunque haya un solo
   * repartidor — así el mesero/cajero ve y confirma explícitamente a quién le está despachando. */
  function handleDeliveryClick(order: LiveOrder) {
    if (couriers.length === 0) {
      setError('Agrega un repartidor en Ajustes → Equipo de Delivery primero.');
      return;
    }
    setCourierPickerFor(order.id);
  }

  // El resto de los roles (Admin, Cajero, Cocina, Pantalla) ve todos.
  const roleFiltered = user?.role === 'WAITER' ? (orders ?? []).filter((o) => leCorresponde(o, user.id)) : orders;

  // Las ya cobradas solo se ven en su propia pestaña: el resto son pantallas de trabajo y una
  // cuenta saldada ahí solo estorba. Es el "limpiar las comandas ya pagadas" — no se borran ni
  // se ocultan del sistema, se mueven a "Pagadas" (y al cerrar caja pasan a Administración).
  const sinCobrar = (lista: LiveOrder[]) => lista.filter((o) => !getPaymentStatus(o).fullyPaid || (['DELIVERY', 'PICKUP'].includes(o.channel) && !o.deliveryFinalizedAt));

  function ordersForFilter(filter: ChannelFilter | null) {
    if (!filter) return deliveryOnly ? (roleFiltered ?? []) : sinCobrar(roleFiltered ?? []);
    if (filter === 'NEW') {
      return sinCobrar(roleFiltered ?? []).filter((o) => o.status === 'PENDING' || o.status === 'NEEDS_CONFIRMATION');
    }
    if (filter === 'AWAITING_PAYMENT') return sinCobrar(roleFiltered ?? []).filter((o) => o.awaitingPayment);
    if (filter === 'PAID') return (roleFiltered ?? []).filter((o) => getPaymentStatus(o).fullyPaid);
    if (filter === 'PARTIAL') return sinCobrar(roleFiltered ?? []).filter((o) => getPaymentStatus(o).owesBalance);
    return sinCobrar(roleFiltered ?? []).filter((o) => o.channel === filter);
  }

  const ordersByTab = ordersForFilter(channelFilter);

  const visibleOrders = pageInfo ? (orders ?? []) : filterByOrderSearch(ordersByTab, orderSearch);


  return (
    <div className="mb-8 w-full min-w-0">
      {deliveryOnly && <div className="mb-3 grid grid-cols-2 gap-2" aria-label="Cantidad de pedidos de delivery"><p className="rounded-2xl bg-white p-3 text-center text-brand-950/60 text-base">Pedidos de hoy<strong className="block text-2xl text-brand-950">{pageInfo?.deliveryStats?.today ?? '—'}</strong></p><p className="rounded-2xl bg-white p-3 text-center text-brand-950/60 text-base">Total de pedidos<strong className="block text-2xl text-brand-950">{pageInfo?.deliveryStats?.total ?? '—'}</strong><span className="text-xs">Sin cancelados</span></p></div>}
      <section className="mb-3 rounded-2xl border border-brand-950/[0.08] bg-white/70 p-3 sm:p-4" aria-label="Gestión de pedidos">
        <h2 className="sr-only">Pedidos</h2>
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="grid w-full grid-cols-2 items-center gap-1 rounded-xl bg-brand-950/[0.04] p-1 md:flex md:w-auto md:shrink-0" role="group" aria-label="Vista de pedidos">
        <button type="button" aria-pressed={!draftsTab} onClick={() => setDraftsTab(false)} className={`min-h-10 rounded-xl px-3 sm:px-4 text-sm font-semibold ${!draftsTab ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/60'}`}>{deliveryOnly ? 'Repartos' : 'Pedidos'}</button>
        {!deliveryOnly && <button type="button" aria-pressed={draftsTab} onClick={() => setDraftsTab(true)} className={`min-h-10 rounded-xl px-3 sm:px-4 text-sm font-semibold ${draftsTab ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/60'}`}>Borradores ({drafts.length})</button>}
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 md:w-auto md:justify-end [&>button]:flex-1 md:[&>button]:flex-none">
          {ORDER_CORRECTION_ROLES.some(role => role === user?.role) && <button type="button" onClick={() => setCorrectionSearchOpen(true)} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-950/10 bg-white px-3 py-2 text-xs font-medium text-brand-950/70"><Pencil className="h-3.5 w-3.5" /> Corregir pedido</button>}
          {['OWNER', 'ADMIN', 'CASHIER'].includes(user?.role ?? '') && (
            <button type="button" onClick={() => setRefundsOpen(true)}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-950/10 bg-white px-3 py-2 text-xs font-medium text-brand-950/70 hover:text-brand-500"
              title="Registrar o consultar devoluciones">
              <History className="h-3.5 w-3.5" /> Devoluciones
            </button>
          )}
          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
            <button
              onClick={() => {
                setDeletionLogOpen(true);
                api.get('/orders/deletion-log').then((res) => setDeletionLog(res.data.data));
              }}
              className="flex min-h-10 items-center justify-center gap-1.5 text-xs font-medium text-brand-950/60 hover:text-brand-950 border border-brand-950/10 bg-white rounded-xl px-3 py-2"
              title="Registro de comandas eliminadas"
            >
              <History className="h-3.5 w-3.5" /> Eliminadas
            </button>
          )}
          {!hideCreateButton && (
            <TextureButton
              variant="success"
              size="default"
              className="!w-auto hidden min-h-11 items-center justify-center gap-1.5 shrink-0 md:ml-2 md:flex"
              onClick={() => { setResumeDraft(null); setFreshDraft(true); setCreateOrderOpen(true); }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Crear pedido
            </TextureButton>
          )}
          </div>
        </div>
      </section>
      {draftsTab && <OrderDraftsPanel drafts={drafts} onResume={draft => { setResumeDraft(draft); setFreshDraft(false); setCreateOrderOpen(true); }} onNew={() => { setResumeDraft(null); setFreshDraft(true); setCreateOrderOpen(true); }} />}
      <div hidden={draftsTab}>
        <div className="mb-4 grid grid-cols-2 items-center gap-2 md:flex md:flex-wrap" aria-label="Buscar y filtrar pedidos">
      <div className="relative col-span-2 min-w-0 md:w-[160px] md:shrink-0 xl:w-[200px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
        <input
          value={orderSearch}
          onChange={(e) => setOrderSearch(e.target.value)}
          placeholder="Buscar pedido…"
          aria-label="Buscar comandas por nombre, cédula o teléfono"
          className="h-11 w-full rounded-[14px] border border-brand-950/10 bg-white/90 pl-10 pr-11 text-brand-950 shadow-[0_1px_2px_rgba(0,27,67,0.04)] outline-none transition-[border-color,box-shadow] duration-150 ease-out-strong placeholder:text-brand-950/35 focus:border-brand-500/60 focus:shadow-[0_0_0_3px_rgba(0,154,255,0.12)] text-base"
        />
        {orderSearch && (
          <button
            type="button"
            onClick={() => setOrderSearch('')}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-brand-950/35 transition-[color,background-color,transform] duration-150 ease-out-strong hover:bg-brand-950/[0.05] hover:text-brand-950/65 active:scale-95 motion-reduce:transition-none"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

        {[{ value: null, label: 'Todas' }, { value: 'NEW' as const, label: 'Nuevas' }].map(option => <button type="button" key={option.label}
          aria-pressed={channelFilter === option.value} onClick={() => { setChannelFilter(option.value); setPage(0); setTarjetasVisibles(40); }}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${channelFilter === option.value ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/65 border border-brand-950/10'}`}>
          {option.label}<span className="rounded-md bg-black/5 px-1.5 text-xs tabular-nums">{pageInfo?.counts[option.value ?? 'ALL'] ?? (orders ? ordersForFilter(option.value).length : '—')}</span>
        </button>)}
        <div className={deliveryOnly ? 'hidden' : 'col-span-2 grid min-w-0 grid-cols-5 items-center gap-2 md:flex md:gap-1.5 md:shrink-0'} role="group" aria-label="Tipo de pedido">
          {(deliveryOnly ? [] : CHANNEL_TABS).map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" title={label} aria-label={label} aria-pressed={channelFilter === value}
              onClick={() => { setChannelFilter(value); setPage(0); setTarjetasVisibles(40); }}
              className={`flex h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-2 md:h-11 md:min-w-11 md:px-3 text-xs font-semibold ${channelFilter === value ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-950/10 bg-white text-brand-950/65 hover:border-brand-500/40 hover:text-brand-500'}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
        {!deliveryOnly && <div className="col-span-2 grid min-w-0 auto-cols-fr grid-flow-col items-center gap-2 md:flex md:gap-1.5" role="group" aria-label="Estado de pago">
          {([
            { value: 'PAID' as const, label: 'Pagados', icon: Check },
            { value: 'PARTIAL' as const, label: 'Fraccionado', icon: SplitSquareHorizontal },
            ...(canAccountsPayable ? [{ value: 'AWAITING_PAYMENT' as const, label: 'Deudas', icon: Clock }] : []),
          ]).map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={channelFilter === value}
              onClick={() => { setChannelFilter(value); setPage(0); setTarjetasVisibles(40); }}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[11px] font-semibold md:h-11 md:min-h-11 md:shrink-0 md:flex-row md:px-2.5 md:text-xs ${channelFilter === value ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-950/10 bg-white text-brand-950/65 hover:border-brand-500/40 hover:text-brand-500'}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}
            </button>
          ))}
        </div>}

        </div>

      {error && <div role="alert" className="mb-3 text-sm text-red-600">{error} <button type="button" onClick={() => void load()} className="min-h-11 px-3 underline">Reintentar</button></div>}

      {loading ? <div role="status" aria-live="polite" className="rounded-2xl border border-brand-950/10 bg-white p-5 text-sm text-brand-950/60">Preparando tus comandas…</div> : error && !orders ? null : visibleOrders?.length === 0 ? (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-6 text-center">
          <p className="text-brand-950/40 font-light text-base">
            {orderSearch ? 'No encontramos comandas con esos datos.' : 'No hay pedidos activos.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] items-start gap-4">
          {visibleOrders?.slice(0, tarjetasVisibles).map((o) => {
            const { balanceBase, owesBalance, fullyPaid } = getPaymentStatus(o);
            const showQuickDecision =
              o.status === 'PENDING' || o.status === 'NEEDS_CONFIRMATION';
            const statusMeta = STATUS_META[o.status] ?? {
              label: STATUS_LABELS[o.status] ?? o.status,
              bg: '#eef3fc',
              fg: 'var(--color-brand-950)',
            };
            return (
            <div
              key={o.id}
              onClick={() => setEditingOrder(o)}
              className="relative flex min-h-[300px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-white/90 bg-white/[0.88] p-4 text-left shadow-[0_1px_2px_rgba(0,27,67,0.05),0_10px_30px_-18px_rgba(0,27,67,0.22)] backdrop-blur-xl transform-gpu transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-950/10 hover:shadow-[0_2px_4px_rgba(0,27,67,0.06),0_18px_42px_-20px_rgba(0,27,67,0.28)] active:scale-[0.985] active:duration-100 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <div className="flex items-start gap-3 pb-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/60"
                  style={{ background: statusMeta.bg, color: statusMeta.fg }}
                >
                  {o.channel === 'DINE_IN' && o.table ? abbreviateTableBadge(o.table.number) : '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold tracking-[-0.01em] text-brand-950 text-base">
                      {CHANNEL_LABELS[o.channel]}{o.table ? ` ${o.table.number}` : ''}
                    </p>
                    <span
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/70 px-2 py-0.5 text-[10px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      style={{ background: statusMeta.bg, color: statusMeta.fg }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                      {statusMeta.label}
                    </span>
                  </div>
                  <p className="truncate font-light text-brand-950/45 text-xs">
                    #{o.orderNumber} · {exactDateTime(o.createdAt)}
                  </p>
                  {o.customerName && <p className={`${deliveryOnly ? 'break-words text-sm font-semibold' : 'truncate text-xs'} text-brand-950/70`}>{o.customerName}</p>}
                  {deliveryOnly && <div className="mt-2 space-y-2 text-sm text-brand-950/65">
                    {!o.customerName && <p>Cliente sin nombre</p>}
                    <p className="flex gap-2 text-base"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{o.customerAddress || 'Dirección pendiente'}</span></p>
                    {o.deliveryCourierId && <p className="text-xs">{couriers.find(c => c.id === o.deliveryCourierId)?.name || 'Repartidor asignado'} <span className={`ml-1 inline-block rounded-full px-2 py-1 font-medium ${o.deliveryCompletedAt ? 'bg-emerald-50 text-emerald-800' : o.deliveryCancelledAt ? 'bg-red-50 text-red-700' : o.deliveryRouteStartedAt ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-900'}`}>{o.deliveryCompletedAt ? 'Entregado' : o.deliveryCancelledAt ? 'Requiere reasignación' : o.deliveryRouteStartedAt ? 'En camino' : 'Asignado'}</span></p>}
                    <p className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 shrink-0" />{o.customerPhone || 'Teléfono pendiente'}</p>
                    <button type="button" onClick={event => { event.stopPropagation(); handleDeliveryClick(o); }} className="min-h-11 rounded-xl border border-brand-950/10 px-3 text-xs font-semibold"><Bike className="mr-1 inline h-4 w-4" />{o.deliveryCourierId ? 'Reasignar repartidor' : 'Asignar repartidor'}</button>
                  </div>}
                  {['DELIVERY', 'PICKUP'].includes(o.channel) && canManageIncomingOrders(user?.role) && <div className="mt-3"><FinalizeDeliveryButton order={o} disabled={busyId === o.id} onFinalized={() => { void load(); }} /></div>}
                  <div className="mt-2"><OrderWhatsappButton order={o} business={restaurant?.name ?? ''} /></div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden border-t border-brand-950/[0.055] py-3">
                <ul className="space-y-1.5 text-sm text-brand-950/85">
                  {o.items.slice(0, 4).map((it) => (
                    <li key={it.id} className="min-w-0">
                      <p className="truncate text-base"><span className="font-semibold">{it.quantity}x</span> {it.productName}{it.variantName ? ` (${it.variantName})` : ''}</p>
                      {it.modifiers.length > 0 && (
                        <p className="truncate pl-4 font-light text-brand-950/45 text-xs">
                          {it.modifiers.map(formatModifierLabel).join(', ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {o.items.length > 4 && <p className="mt-1.5 font-medium text-brand-950/40 text-xs">+{o.items.length - 4} productos más</p>}
              </div>

              <div className="-mx-4 -mb-4 flex items-end justify-between gap-3 border-t border-brand-950/[0.045] bg-brand-950/[0.018] px-4 pb-4 pt-3 backdrop-blur-sm">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-none tracking-[-0.015em] text-brand-950">{formatBase(o.totalBase, symbol)}</p>
                  <p className="mt-1 font-light text-brand-950/40 text-xs">{formatBsAbsolute(o.totalBs)}</p>
                </div>
                <div className="text-right">
                  {showQuickDecision ? (
                    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      {(o.channel === 'DELIVERY' || o.channel === 'PICKUP') && canManageIncomingOrders(user?.role) && !fullyPaid && !o.fiscalPrintedAt && !o.adminCorrectedAt && (
                        <button
                          type="button"
                          aria-label={`Editar comanda ${o.orderNumber}`}
                          title="Modificar productos, cantidades y notas antes de aceptar"
                          disabled={busyId === o.id}
                          onClick={() => setEditingOrder(o)}
                          className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-brand-500/10 px-2 text-xs font-semibold text-brand-600 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Rechazar comanda ${o.orderNumber}`}
                        title="Rechazar"
                        disabled={busyId === o.id}
                        onClick={() => rejectFromCard(o)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Aceptar comanda ${o.orderNumber}`}
                        title={o.placedByUser ? 'Enviar a cocina' : o.channel === 'DINE_IN' ? 'Aceptar' : 'Cobrar y aceptar'}
                        disabled={busyId === o.id}
                        onClick={() => acceptFromCard(o)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {fullyPaid ? (
                        <p className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 text-xs"><Check className="h-3.5 w-3.5" aria-hidden="true" />Pagado</p>
                      ) : owesBalance ? (
                        <p className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 text-xs"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Debe {formatBase(balanceBase, symbol)}</p>
                      ) : null}
                      <p className="mt-1 text-brand-950/35 text-xs">{timeAgo(o.createdAt)}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* El resto sigue cargado en memoria: esto solo controla cuántas tarjetas se pintan. */}
      {!pageInfo && visibleOrders && visibleOrders.length > tarjetasVisibles && (
        <button
          type="button"
          onClick={() => setTarjetasVisibles((n) => n + 40)}
          className="mt-3 w-full rounded-xl border border-brand-950/10 bg-white py-2.5 text-sm font-medium text-brand-950/60 hover:bg-brand-950/[0.03]"
        >
          Ver más pedidos ({visibleOrders.length - tarjetasVisibles} restantes)
        </button>
      )}
      {pageInfo && pageInfo.total > 40 && <div className="mt-4 flex items-center justify-between gap-2 text-sm">
        <button type="button" disabled={loading || pageInfo.page === 0} onClick={() => setPage(pageInfo.page - 1)} className="min-h-11 rounded-xl border border-brand-950/10 bg-white px-4 disabled:opacity-40">Anterior</button>
        <span className="text-center text-xs text-brand-950/60">{pageInfo.page * 40 + 1}–{Math.min((pageInfo.page + 1) * 40, pageInfo.total)} de {pageInfo.total}</span>
        <button type="button" disabled={loading || (pageInfo.page + 1) * 40 >= pageInfo.total} onClick={() => setPage(pageInfo.page + 1)} className="min-h-11 rounded-xl border border-brand-950/10 bg-white px-4 disabled:opacity-40">Siguiente</button>
      </div>}

      </div>
      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onSaved={load} />
      )}
      {correctionSearchOpen && <FindOrderCorrectionDialog onClose={() => setCorrectionSearchOpen(false)} onSaved={load} />}
      {refundsOpen && <OrderRefundDialog onClose={() => setRefundsOpen(false)} />}

      {createOrderOpen && !createOrders && <p role="status" className="py-3 text-brand-950/60 text-base">Preparando las cuentas existentes…</p>}
      {createOrderOpen && createOrders && (
        <CreateOrderDialog
          resumeDraftKey={resumeDraft?.key}
          freshDraft={freshDraft}
          initialTableId={resumeDraft?.initialTableId}
          initialNewAccount={resumeDraft?.newAccount}
          employeeConsumption={resumeDraft?.employee}
          existingOrders={createOrders}
          onClose={() => { setCreateOrderOpen(false); setResumeDraft(null); setFreshDraft(false); }}
          onCreated={(newOrder, paymentMode) => {
            load();
            if (newOrder && paymentMode) setPaymentDialog({ order: newOrder, mode: paymentMode });
          }}
          onSelectExisting={(orderId) => {
            setCreateOrderOpen(false);
            const target = createOrders.find((o) => o.id === orderId);
            if (target) setEditingOrder(target);
          }}
        />
      )}

      {paymentDialog && (
        <PaymentDialog
          order={paymentDialog.order}
          mode={paymentDialog.mode}
          onClose={() => setPaymentDialog(null)}
          onPaid={(fullyPaid) => {
            const paidOrder = paymentDialog.order;
            if (fullyPaid && !paidOrder.placedByUser && (paidOrder.status === 'PENDING' || paidOrder.status === 'NEEDS_CONFIRMATION')) {
              api
                .post(`/orders/${paidOrder.id}/accept`)
                .then(() => autoDispatchAfterPayment(paidOrder))
                .catch((e: any) => setError(e.response?.data?.error ?? 'El pago se registró, pero no se pudo enviar a cocina.'))
                .finally(load);
            } else {
              load();
              if (fullyPaid) autoDispatchAfterPayment(paidOrder);
            }
          }}
        />
      )}

      {courierPickerFor && (
        <CourierPickerDialog
          open
          couriers={couriers}
          busy={busyId === courierPickerFor}
          onPick={(courierId) => dispatch(courierPickerFor, courierId)}
          onClose={() => setCourierPickerFor(null)}
        />
      )}

      {deletionLogOpen && (
        <Dialog open onOpenChange={(open) => !open && setDeletionLogOpen(false)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comandas eliminadas</DialogTitle>
            </DialogHeader>
            <p className="text-brand-950/50 font-light -mt-1 mb-2 text-xs">
              Registro permanente: cada comanda borrada queda aquí con quién la borró. No se puede eliminar.
            </p>
            {!deletionLog ? (
              <p className="text-brand-950/50 text-base">Cargando…</p>
            ) : deletionLog.length === 0 ? (
              <p className="text-brand-950/50 text-base">Ninguna comanda ha sido eliminada.</p>
            ) : (
              <div className="space-y-2.5">
                {deletionLog.map((r) => (
                  <div key={r.id} className="rounded-xl border border-brand-950/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-950">
                        #{r.orderNumber}
                        {r.tableName ? ` · ${r.tableName}` : ''}
                        {r.customerName ? ` · ${r.customerName}` : ''}
                      </span>
                      <span className="text-sm font-bold text-brand-950">{formatBase(r.totalBase, symbol)}</span>
                    </div>
                    <p className="text-brand-950/60 mt-0.5 text-xs">
                      {r.items.map((it) => `${it.quantity}x ${it.name}${it.variantName ? ` (${it.variantName})` : ''}`).join(', ')}
                    </p>
                    {/* Lo que de verdad importa revisar: si ya se había cobrado, esa plata entró
                        a la caja y el pedido que la respaldaba ya no existe. */}
                    {r.paidBase > 0 && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-900 text-xs">
                        ⚠ Ya se habían cobrado {formatBase(r.paidBase, symbol)}
                        {r.paidMethods?.length ? ` · ${r.paidMethods.map((m) => m.metodo).join(', ')}` : ''}
                      </p>
                    )}
                    <p className="text-red-600/80 mt-1.5 text-xs">
                      Eliminada por <span className="font-semibold">{r.deletedByName}</span> ({r.deletedByRole}) ·{' '}
                      {new Date(r.deletedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="mt-1 text-brand-950/60 text-xs">
                      <span className="font-semibold">Motivo:</span> {r.deletionReason ?? 'No registrado (borrado anterior)'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {deleteTarget && (
        <DeleteOrderDialog
          order={deleteTarget}
          role={user?.role}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

function DeleteOrderDialog({
  order,
  role,
  onClose,
  onDeleted,
}: {
  order: LiveOrder;
  role?: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = getPaymentStatus(order).fullyPaid;
  const needsPin = role === 'WAITER';

  async function remove() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError('Escribe el motivo de la eliminación.');
      return;
    }
    if (needsPin && pin.length !== 6) {
      setError('Ingresa el código de 6 dígitos configurado por el administrador.');
      return;
    }
    if (paid && !refundConfirmed) {
      setError('Confirma primero que devolviste el dinero al cliente por el mismo medio acordado. QuickTap no envía el reembolso al banco.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/orders/${order.id}`, { data: { reason: cleanReason, pin: needsPin ? pin : undefined } });
      onDeleted();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo eliminar la comanda.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{paid ? 'Eliminar comanda pagada' : 'Eliminar comanda'} #{order.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={`rounded-xl border p-3 text-xs leading-relaxed ${paid ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {paid
              ? 'Esta anulación administrativa no devuelve el dinero automáticamente. Úsala solo después de entregar el reembolso al cliente y únicamente si NO se emitió factura fiscal. Se revertirán los registros internos y quedará la bitácora del borrado.'
              : 'La comanda desaparecerá de la operación. Solo quedará la bitácora de comanda borrada.'}
          </div>
          {paid && (
            <label className="flex items-start gap-2 text-brand-950/75 text-sm font-medium">
              <input type="checkbox" checked={refundConfirmed} onChange={(event) => setRefundConfirmed(event.target.checked)} className="mt-1" />
              Confirmo que el dinero ya fue devuelto al cliente y que esta comanda no tiene factura fiscal emitida.
            </label>
          )}
          <label className="block text-sm font-medium">
            <span className="text-sm font-semibold text-brand-950">Motivo del borrado *</span>
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Ej. Pedido duplicado y cobro devuelto al cliente"
              className="mt-1.5 w-full resize-none rounded-xl border border-brand-950/15 px-3 py-2.5 text-brand-950 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 text-base"
            />
            <span className="mt-1 block text-right text-[10px] text-brand-950/35">{reason.length}/300</span>
          </label>
          {needsPin && (
            <label className="block text-sm font-medium">
              <span className="text-sm font-semibold text-brand-950">Código de autorización *</span>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="6 dígitos"
                className="mt-1.5 h-11 w-full rounded-xl border border-brand-950/15 px-3 text-center text-lg font-bold tracking-[0.4em] text-brand-950 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
          )}
          {error && <p className="text-red-600 text-base">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <TextureButton variant="minimal" size="default" disabled={deleting} onClick={onClose}>Cancelar</TextureButton>
            <TextureButton variant="destructive" size="default" disabled={deleting || reason.trim().length < 3 || (paid && !refundConfirmed)} onClick={remove}>
              <Trash2 className="h-4 w-4" /> {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </TextureButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Espejo de RETURN_REASONS en src/modules/orders/order.dto.ts — motivos que un mesero puede
 * explicar al quitar/reducir un ítem ya entregado (subconjunto de WasteReason). */
const RETURN_REASONS = ['CUSTOMER_RETURN', 'PREPARATION', 'DAMAGED', 'OTHER'] as const;
const RETURN_REASON_LABELS: Record<(typeof RETURN_REASONS)[number], string> = {
  CUSTOMER_RETURN: 'El cliente lo devolvió',
  PREPARATION: 'Se preparó mal',
  DAMAGED: 'Se dañó o se cayó',
  OTHER: 'Otro motivo',
};

interface EditOrderDialogProps {
  order: LiveOrder;
  onClose: () => void;
  onSaved: () => void;
  /** Órdenes de Mesa: pestañas para saltar a otro pedido activo de la misma mesa + Rodar/Cerrar
   * mesa, fijos arriba (no se pierden al desplazarse dentro del editor). */
  mesaFooter?: ReactNode;
  /** 'mesa' (Órdenes de Mesa): oculta Pagar/Fraccionado/Deuda — ahí se cobra por cuenta desde el
   * botón "Cobrar" del diálogo de mesa, que ya cubre esa misma función — y cambia "Descargar" por
   * "Enviar por WhatsApp" al teléfono capturado al abrir la cuenta. 'pedidos' (default):
   * comportamiento de siempre, sin cambios. */
  context?: 'pedidos' | 'mesa';
}

export function EditOrderDialog({ order, onClose, onSaved, mesaFooter, context = 'pedidos' }: EditOrderDialogProps) {
  const isMesa = context === 'mesa';
  const { restaurant, user } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const { show, toastMessage } = useToast();
  const { fullyPaid, balanceBase } = getPaymentStatus(order);
  const [name, setName] = useState(order.customerName ?? '');
  const [phone, setPhone] = useState(order.customerPhone ?? '');
  const [address, setAddress] = useState(order.customerAddress ?? '');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState(order.customerNote ?? '');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [mobileSummary, setMobileSummary] = useState(false);
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<LiveOrderItem | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [replacement, setReplacement] = useState<{ itemId: string; line: CartLine } | null>(null);
  const [replacementReason, setReplacementReason] = useState('');
  // Productos nuevos tocados pero todavía sin confirmar: se acumulan acá (no llaman al
  // servidor) hasta que el mesero presiona "Enviar a cocina" — antes se mandaban al toque,
  // uno por uno, sin darle chance de revisar lo que está a punto de salir impreso en cocina.
  const [pendingLines, setPendingLines] = useState<CartLine[]>([]);
  const [sendingPending, setSendingPending] = useState(false);
  const pendingRequest = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showReciboMenu, setShowReciboMenu] = useState(false);
  const [showFiscalDialog, setShowFiscalDialog] = useState(false);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'split' | null>(null);
  const [markingDebt, setMarkingDebt] = useState(false);
  const [togglingDeliveredId, setTogglingDeliveredId] = useState<string | null>(null);
  // "Devolver" (quitar/reducir un ítem ya entregado): pide motivo, queda registrado en Merma.
  const [returnPromptFor, setReturnPromptFor] = useState<LiveOrderItem | null>(null);
  const [removePromptFor, setRemovePromptFor] = useState<LiveOrderItem | null>(null);
  const [removeQty, setRemoveQty] = useState(1);
  const [returnReason, setReturnReason] = useState<(typeof RETURN_REASONS)[number]>('CUSTOMER_RETURN');
  const [returnQty, setReturnQty] = useState(1);
  const [returnNote, setReturnNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Cambiar el tipo de pedido (Mesa/Delivery/Pick-up/Barra) desde este mismo diálogo.
  const [pendingChannel, setPendingChannel] = useState<LiveOrder['channel'] | null>(null);
  const [channelTables, setChannelTables] = useState<{ id: string; number: string; zoneName: string | null }[] | null>(null);
  const [channelTableId, setChannelTableId] = useState('');
  const [channelAddress, setChannelAddress] = useState('');
  const [channelAddressCoords, setChannelAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [changingChannel, setChangingChannel] = useState(false);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
    if (order.channel === 'DELIVERY') {
      api.get('/delivery-couriers').then((res) => setCouriers(res.data.data));
    }
  }, [order.channel]);

  async function applyChannelChange(
    channel: LiveOrder['channel'],
    extra?: { tableId?: string; customerAddress?: string; customerLat?: number; customerLng?: number },
  ) {
    setChangingChannel(true);
    setError(null);
    try {
      await api.patch(`/orders/${order.id}/channel`, { channel, ...extra });
      setPendingChannel(null);
      setShowChannelPicker(false);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cambiar el tipo de pedido.');
    } finally {
      setChangingChannel(false);
    }
  }

  function handleChannelSelect(channel: LiveOrder['channel']) {
    if (channel === order.channel) return;
    if (channel === 'PICKUP' || channel === 'BAR' || channel === 'EXPRESS') {
      applyChannelChange(channel);
      return;
    }
    setPendingChannel(channel);
    setChannelTableId('');
    setChannelAddress(order.customerAddress ?? '');
    setChannelAddressCoords(null);
    if (channel === 'DINE_IN' && channelTables === null) {
      api.get('/tables/floor-plan').then((res) => {
        const plan = res.data.data;
        const zoned = plan.zones.flatMap((z: any) => z.tables.map((t: any) => ({ id: t.id, number: t.number, zoneName: z.name })));
        const unzoned = plan.unzoned.map((t: any) => ({ id: t.id, number: t.number, zoneName: null }));
        setChannelTables([...zoned, ...unzoned]);
      });
    }
  }

  /** Botón "Delivery": despacha el pedido al repartidor elegido (o directo, si solo
   * hay uno registrado) — mismo endpoint que el botón "Delivery" de la tarjeta. */
  async function dispatchCourier(courierId: string) {
    const win = window.open('', '_blank');
    setDispatching(true);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${order.id}/dispatch-courier`, { courierId });
      handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
      setShowCourierPicker(false);
      onSaved();
    } catch (e: any) {
      win?.close();
      setError(e.response?.data?.error ?? 'No se pudo despachar el pedido.');
    } finally {
      setDispatching(false);
    }
  }

  /** Igual que autoDispatchAfterPayment() en el panel: "Despacho automático al
   * cobrar" (Ajustes → Delivery), para que funcione también cobrando desde la
   * ficha del pedido y no solo desde la tarjeta de la lista. */
  async function autoDispatchAfterPayment() {
    if (order.channel !== 'DELIVERY') return;

    if (restaurant?.deliveryAutoAssignOnPaid) {
      const win = window.open('', '_blank');
      try {
        const { data } = await api.post(`/orders/${order.id}/dispatch-courier`, {});
        if (data.data?.url || data.data?.sent || data.data?.assignedToApp) {
          handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
        } else {
          win?.close();
          setError('El pedido se cobró, pero no hay repartidores activos para despacharlo.');
        }
      } catch (e: any) {
        win?.close();
        setError(e.response?.data?.error ?? 'El pedido se cobró, pero no se pudo despachar automáticamente.');
      }
      return;
    }

    if (restaurant?.deliveryAutoOpenOnPaid) handleDeliveryClick();
  }

  /** Siempre abre la ventana con todo el equipo de delivery para elegir, aunque haya un solo
   * repartidor — así el mesero/cajero ve y confirma explícitamente a quién le está despachando. */
  function handleDeliveryClick() {
    if (couriers.length === 0) {
      setError('Agrega un repartidor en Ajustes → Equipo de Delivery primero.');
      return;
    }
    setShowCourierPicker(true);
  }

  /** Botón "Imprimir": no imprime desde este navegador — reenvía la comanda a la
   * estación de impresión (print-station), que es quien tiene las impresoras conectadas. */
  async function printComanda() {
    setPrinting(true);
    setError(null);
    try {
      if (order.status === 'PENDING' || order.status === 'NEEDS_CONFIRMATION') {
        // Si ya se aceptó justo antes (doble click), el 400 de "ya no está pendiente" no debe frenar la impresión.
        await api.post(`/orders/${order.id}/accept`).catch(() => {});
        onSaved();
      }
      await api.post(`/orders/${order.id}/print-comanda`);
      // La estación recibe el ticket al instante; mantenemos el estado visible un momento
      // para que quien atendió confirme que la comanda sí fue enviada a impresión.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda a la estación de impresión.');
    } finally {
      setPrinting(false);
    }
  }

  /** Botón "Nota de entrega": reenvía el documento detallado (precio en Bs y $, desglose
   * completo) a la impresora de Caja — independiente de "Comanda", que nunca lo imprime.
   * El tipo interno sigue siendo `recibo`: es la clave del protocolo con la estación de
   * impresión y de su configuración guardada, renombrarla rompería instalaciones existentes. */
  async function printReceiptFull() {
    setPrintingReceipt(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/print-receipt`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la nota de entrega a la estación de impresión.');
    } finally {
      setPrintingReceipt(false);
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

  /** Botón "Deuda" del disclosure de Pago: marca el pedido como cuenta abierta
   * (mismo endpoint que el toggle Cta. abierta/Pendiente de la tarjeta). */
  async function markDebt() {
    setMarkingDebt(true);
    try {
      await api.patch(`/orders/${order.id}/awaiting-payment`, { awaitingPayment: true });
      onSaved();
    } finally {
      setMarkingDebt(false);
    }
  }

  /** "Entregado": el mesero lo marca cuando de verdad lleva el producto a la mesa/cliente —
   * a partir de ahí, quitarlo/reducirlo pide motivo (ver returnItem más abajo). */
  async function toggleDelivered(it: LiveOrderItem) {
    setTogglingDeliveredId(it.id);
    try {
      await api.patch(`/orders/${order.id}/items/${it.id}/delivered`, { delivered: !it.deliveredAt });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo marcar como entregado.');
    } finally {
      setTogglingDeliveredId(null);
    }
  }

  /** Toda reducción posterior a comandar exige motivo y queda en la auditoría operativa. */
  function requestQtyDecrease(it: LiveOrderItem) {
    setError(null);
    if (order.fiscalPrintedAt) {
      setError(`La factura fiscal ${order.fiscalPrinterInvoice ?? ''} ya fue emitida. No borres el producto: primero corresponde una nota de crédito fiscal por la devolución.`);
      return;
    }
    if (fullyPaid) {
      setError('Esta comanda ya fue pagada. No se puede quitar el producto sin registrar la devolución del dinero. Si se emitió factura fiscal, también corresponde una nota de crédito.');
      return;
    }
    setReturnPromptFor(it);
    setReturnReason(it.deliveredAt ? 'CUSTOMER_RETURN' : 'OTHER');
    setReturnQty(1);
    setReturnNote('');
    setReturnError(null);
  }

  async function confirmRemoveQuantity() {
    if (!removePromptFor) return;
    const item = removePromptFor;
    setRemovePromptFor(null);
    await setQty(item.id, item.quantity - removeQty);
  }

  /** Registra la devolución de 1 unidad con motivo — queda en Merma (WasteReason) como su
   * propia estadística, aparte de las ventas. */
  async function confirmReturn() {
    if (!returnPromptFor) return;
    if (returnNote.trim().length < 3) {
      setReturnError('Escribe el motivo de la eliminación.');
      return;
    }
    setReturning(true);
    setReturnError(null);
    try {
      await api.post(`/orders/${order.id}/items/${returnPromptFor.id}/return`, {
        quantity: returnQty,
        reason: returnReason,
        note: returnNote.trim(),
      });
      setReturnPromptFor(null);
      onSaved();
    } catch (e: any) {
      setReturnError(e.response?.data?.error ?? 'No se pudo registrar la devolución.');
    } finally {
      setReturning(false);
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
    const item = order.items.find((entry) => entry.id === orderItemId);
    if (item && quantity < item.quantity) {
      requestQtyDecrease(item);
      setReturnQty(Math.min(item.quantity - item.paidQuantity, item.quantity - Math.max(0, quantity)));
      return;
    }
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

  /** Un producto tocado se acumula en `pendingLines` en vez de mandarse de una vez — la
   * confirmación real (y la impresión que dispara, ver order.service.ts addItem) espera al
   * botón "Enviar a cocina". */
  function queueProductLine(line: CartLine) {
    setPendingLines((prev) => [...prev, line]);
  }

  function removePendingLine(index: number) {
    setPendingLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function sendPendingLines() {
    if (pendingLines.length === 0 || pendingRequest.current) return;
    pendingRequest.current = true;
    setSendingPending(true);
    setError(null);
    try {
      // Una sola llamada con TODAS las líneas: así cocina recibe UNA comanda de adición con
      // todo junto, no una por producto (antes era secuencial, una petición por línea, y cada
      // una disparaba su propia impresión por separado).
      await api.post(`/orders/${order.id}/items/batch`, {
        items: pendingLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          variantId: line.variantId,
          modifierIds: line.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          comboSelections: line.comboSelections,
          note: line.note,
        })),
      });
      setPendingLines([]);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar a cocina.');
    } finally {
      pendingRequest.current = false;
      setSendingPending(false);
    }
  }

  /** El servidor registra el motivo y sustituye la línea de forma atómica. */
  async function replaceItemWithLine(oldItemId: string, line: CartLine) {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/orders/${order.id}/items/${oldItemId}`, {
        productId: line.product.id, quantity: line.quantity, variantId: line.variantId,
        modifierIds: line.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
        comboSelections: line.comboSelections, note: line.note,
        reason: replacementReason.trim(),
      });
      setReplacement(null);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo actualizar el producto.');
    } finally {
      onSaved();
      setSaving(false);
    }
  }

  /** Tocar un ítem ya pedido: si tiene variantes/modificadores, abre el selector precargado
   * con lo que ya tenía (buscado por nombre, ya que el snapshot no guarda el id original). */
  function openItemForEdit(it: LiveOrderItem) {
    const product = products?.find((p) => p.id === it.productId);
    if (!product) return;
    try { initialSelectionFor(it, product); }
    catch (error) { setError(error instanceof Error ? error.message : 'Revisa las opciones del producto.'); return; }
    setEditingItem(it);
    setOptionsProduct(product);
  }

  /** Preselección best-effort para editar un ítem: busca por nombre contra el producto actual,
   * La variante se recupera por nombre; los modificadores conservan su identificador. */
  function initialSelectionFor(it: LiveOrderItem, product: Product) {
    const variant = product.variants?.find((v) => v.name === it.variantName);
    const modifierIds = restoreModifierSelection(it.modifiers, (product.modifierCategories ?? []).flatMap(c => c.modifiers));
    return { variantId: variant?.id ?? null, modifierIds };
  }

  /** Previsualización de lo tocado en esta ronda, todavía sin mandar a cocina — ver
   * queueProductLine/sendPendingLines arriba. Se reutiliza en el layout de POS (columnas fijas)
   * y en el de siempre (celular/escritorio angosto), que arman el panel de "Productos" por
   * separado. */
  const pendingLinesPanel = pendingLines.length > 0 && (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 space-y-2">
      <p className="font-semibold text-amber-800 text-xs">Por enviar a cocina</p>
      <ul className="space-y-1.5">
        {pendingLines.map((l, i) => {
          const unitPrice = cartLineUnitPrice(l);
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-950 text-base">
                  {l.quantity}x {l.product.name}
                  {l.variantName && <span className="text-brand-950/50 font-normal"> ({l.variantName})</span>}
                </p>
                {l.selectedModifiers.length > 0 && (
                  <p className="text-brand-950/50 text-base">{l.selectedModifiers.map(formatModifierLabel).join(', ')}</p>
                )}
                {l.note && <p className="text-brand-950/50 italic text-base">Nota: {l.note}</p>}
              </div>
              <span className="text-brand-950/60 shrink-0">{formatBase(unitPrice * l.quantity, symbol)}</span>
              <button
                type="button"
                disabled={sendingPending}
                onClick={() => removePendingLine(i)}
                className="shrink-0 text-brand-950/30 hover:text-red-500"
                aria-label="Quitar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <TextureButton variant="brand" size="sm" className="!w-full" disabled={sendingPending} onClick={sendPendingLines}>
        {sendingPending ? 'Enviando…' : 'Enviar a cocina'}
      </TextureButton>
    </div>
  );

  const canCorrectOrder = ORDER_CORRECTION_ROLES.some(role => role === user?.role);
  const openDelivery = ['DELIVERY', 'PICKUP'].includes(order.channel) && !order.deliveryFinalizedAt && order.status !== 'CANCELLED';
  const needsCorrection = (!!order.deliveryFinalizedAt || !!order.adminCorrectedAt || (!openDelivery && (fullyPaid || order.status === 'SERVED'))) && !order.isEmployeeConsumption;
  if (showCorrection && canCorrectOrder) {
    return <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Editar pedido #{order.orderNumber}</DialogTitle></DialogHeader>
        <button type="button" onClick={() => setShowCorrection(false)} className="min-h-11 text-left text-sm text-brand-500">← Volver al pedido</button>
        <OrderCorrectionPanel orderId={order.id} onSaved={onSaved} livePayment={openDelivery && !needsCorrection} />
      </DialogContent>
    </Dialog>;
  }

  const canDeleteOrder =
    !(openDelivery && fullyPaid) && !needsCorrection && !order.fiscalPrintedAt && !order.adminCorrectedAt && ['OWNER', 'ADMIN', 'CASHIER', 'STAFF', 'WAITER'].includes(user?.role ?? '');
  const canLeavePending = !fullyPaid && !isMesa && canAccountsPayable;
  const deleteOrderButton = order.fiscalPrintedAt ? (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 leading-relaxed text-amber-900 text-xs">
      Factura fiscal {order.fiscalPrinterInvoice ?? ''} emitida: no se puede borrar ni modificar esta venta. La devolución debe documentarse con una nota de crédito fiscal vinculada a esa factura; QuickTap no la emite automáticamente desde este botón.
    </p>
  ) : canDeleteOrder ? (
    <button
      type="button"
      onClick={() => setDeletePromptOpen(true)}
      className="flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2 py-2.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
    >
      <Trash2 className="h-4 w-4 shrink-0" /> Eliminar pedido
    </button>
  ) : null;

  const editorBusy = saving || sendingPending || changingChannel;
  function closeEditor() {
    if (editorBusy) return;
    const customerChanged = name !== (order.customerName ?? '') || phone !== (order.customerPhone ?? '') || note !== (order.customerNote ?? '') || address !== (order.customerAddress ?? '');
    if (pendingLines.length || customerChanged) setConfirmClose(true);
    else onClose();
  }

  return (
    <Dialog open onOpenChange={open => !open && closeEditor()}>
      <DialogContent hideClose className="order-workspace !fixed !inset-0 !left-0 !top-0 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !p-0 !gap-0 !flex !flex-col !overflow-hidden !bg-[#f4f6f9]">
        <div className="shrink-0 border-b border-brand-950/10 bg-white px-4 py-2 md:px-5 space-y-2">
          <div className="relative space-y-2">
          <DialogHeader className="!flex-row items-center gap-3 !space-y-0 !pr-24">
            <button type="button" aria-label="Volver a pedidos" onClick={closeEditor} disabled={editorBusy} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-950/10 text-brand-950 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="!text-base !font-semibold">Editar pedido #{order.orderNumber}</DialogTitle>
              <p className="text-brand-950/50 text-xs">{order.customerName || 'Sin cliente'}{order.table ? ` · Mesa ${order.table.number}` : ''}</p>
            </div>
            <button type="button" disabled={editorBusy} onClick={closeEditor} className="absolute inset-y-0 right-0 my-auto flex h-11 min-w-20 items-center justify-center rounded-xl bg-brand-950/[0.04] px-4 text-center text-sm font-semibold leading-none text-brand-950 disabled:opacity-50">Listo</button>
          </DialogHeader>
          <div className="flex min-h-9 items-center gap-3 pr-24">
            <span className="rounded-lg bg-brand-950/[0.05] px-3 py-1.5 text-xs font-semibold text-brand-950">
              {CHANNEL_LABELS[order.channel]}{order.channel === 'DINE_IN' && order.table ? ` ${order.table.number}` : ''}
            </span>
            {!(openDelivery && fullyPaid) && !needsCorrection && !order.fiscalPrintedAt && <button
              type="button"
              aria-expanded={showChannelPicker}
              aria-controls="edit-order-channel-picker"
              disabled={editorBusy}
              onClick={() => { setShowChannelPicker(!showChannelPicker); setPendingChannel(null); }}
              className="min-h-10 text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
            >{showChannelPicker ? 'Cerrar opciones' : 'Cambiar tipo'}</button>}
          </div>
          </div>
          {showChannelPicker && <div id="edit-order-channel-picker" role="group" aria-label="Tipo de pedido" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-brand-950/[0.06] bg-brand-950/[0.04] p-1 md:max-w-xl">
            {([{ value: 'DINE_IN', label: 'Mesa', icon: UtensilsCrossed }, { value: 'EXPRESS', label: 'Express', icon: Zap }, { value: 'BAR', label: 'Barra', icon: Martini }, { value: 'DELIVERY', label: 'Delivery', icon: Bike }, { value: 'PICKUP', label: 'Pick-up', icon: Store }] as const).map(option => <button key={option.value} type="button" aria-pressed={(pendingChannel ?? order.channel) === option.value} disabled={editorBusy || needsCorrection || !!order.fiscalPrintedAt} onClick={() => handleChannelSelect(option.value)} className={`flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold sm:text-sm disabled:opacity-50 ${(pendingChannel ?? order.channel) === option.value ? 'bg-white text-brand-950 shadow-sm ring-1 ring-brand-950/10' : 'text-brand-950/65 hover:bg-white/60'}`}><option.icon className="h-4 w-4 shrink-0" />{option.label}</button>)}
          </div>}
          {canCorrectOrder && needsCorrection && <button type="button" onClick={() => setShowCorrection(true)} className="min-h-11 rounded-xl bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-600">Corregir o anular pedido</button>}
          {pendingChannel === 'DINE_IN' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={channelTableId}
                onChange={(e) => setChannelTableId(e.target.value)}
                className="flex-1 min-w-[10rem] border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
              >
                <option value="">{channelTables === null ? 'Cargando mesas…' : 'Selecciona una mesa…'}</option>
                {channelTables?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.zoneName ? `${t.zoneName} · ${t.number}` : t.number}
                  </option>
                ))}
              </select>
              <TextureButton
                variant="brand"
                size="sm"
                className="!w-auto"
                disabled={!channelTableId || changingChannel}
                onClick={() => applyChannelChange('DINE_IN', { tableId: channelTableId })}
              >
                {changingChannel ? 'Cambiando…' : 'Confirmar cambio'}
              </TextureButton>
              <button
                type="button"
                onClick={() => setPendingChannel(null)}
                className="text-xs font-medium text-brand-950/50 hover:text-brand-950/70"
              >
                Cancelar
              </button>
            </div>
          )}

          {pendingChannel === 'DELIVERY' && (
            <div className="space-y-2">
              <AddressAutocomplete
                value={channelAddress}
                onChange={setChannelAddress}
                onSelect={(s) => {
                  setChannelAddress(s.displayName);
                  setChannelAddressCoords({ lat: s.lat, lng: s.lng });
                }}
                biasLat={restaurant?.deliveryOriginLat}
                biasLng={restaurant?.deliveryOriginLng}
                placeholder="Dirección de entrega *"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              />
              <div className="flex items-center gap-2">
                <TextureButton
                  variant="brand"
                  size="sm"
                  className="!w-auto"
                  disabled={!channelAddress.trim() || changingChannel}
                  onClick={() =>
                    applyChannelChange('DELIVERY', {
                      customerAddress: channelAddress,
                      customerLat: channelAddressCoords?.lat,
                      customerLng: channelAddressCoords?.lng,
                    })
                  }
                >
                  {changingChannel ? 'Cambiando…' : 'Confirmar cambio'}
                </TextureButton>
                <button
                  type="button"
                  onClick={() => setPendingChannel(null)}
                  className="text-xs font-medium text-brand-950/50 hover:text-brand-950/70"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {mesaFooter && <div className="space-y-2 pb-2 border-b border-brand-950/10">{mesaFooter}</div>}
        <div className="flex min-h-0 flex-1">
              <div className={`${mobileSummary ? 'hidden md:block' : ''} min-w-0 flex-1 overflow-y-auto p-5`}>
                {products === null ? <p role="status" className="text-brand-950/50 text-base">Cargando menú…</p> : <OrderMenuCatalog products={products} symbol={symbol}
                  quantityFor={id => order.items.filter(item => item.productId === id).reduce((total, item) => total + item.quantity, 0) + pendingLines.filter(line => line.product.id === id).reduce((total, line) => total + line.quantity, 0)}
                  disabled={editorBusy || needsCorrection || !!order.fiscalPrintedAt}
                  onSelect={product => { setEditingItem(null); if (productNeedsOptions(product)) setOptionsProduct(product); else queueProductLine({ product, quantity: 1, selectedModifiers: [] }); }} />}
              </div>
              <div className={`${mobileSummary ? 'flex' : 'hidden md:flex'} min-h-0 w-full flex-col gap-4 overflow-y-auto overscroll-contain border-l border-brand-950/10 bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:w-[360px] md:shrink-0 [&>*]:shrink-0`} data-order-actions-scroll>
                <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold text-brand-950">Resumen del pedido</h2><button type="button" className="min-h-10 text-sm font-semibold text-brand-500 md:hidden" onClick={() => setMobileSummary(false)}>Volver al menú</button></div>
                {order.channel !== 'DINE_IN' && (
                  <details className="space-y-2 rounded-2xl border border-brand-950/10 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-brand-950">{order.customerName || 'Datos del cliente'} <span className="font-normal text-brand-500">· Editar</span></summary>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre"
                      className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                    />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Teléfono"
                      className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
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
                      className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                    />
                    <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={saving} onClick={saveCustomer}>
                      Guardar datos del cliente
                    </TextureButton>
                  </details>
                )}

                <div className="flex flex-col">
                  <p className="font-bold text-brand-950 shrink-0 text-base">Productos</p>
                  <GroupedOrderItems items={order.items} symbol={symbol} renderItem={(it) => {
                      const canEdit = !editorBusy && !needsCorrection && !order.fiscalPrintedAt && Boolean(products?.find((p) => p.id === it.productId));
                      const delivered = !!it.deliveredAt;
                      return (
                        <li key={it.id} className="relative isolate flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                          {canEdit && <button
                            type="button"
                            aria-label={`Editar ${it.productName}${it.variantName ? ` (${it.variantName})` : ''}`}
                            onClick={() => openItemForEdit(it)}
                            className="absolute inset-0 z-0 rounded-lg transition-colors hover:bg-brand-950/[0.03] focus-visible:outline-2 focus-visible:outline-brand-500"
                          />}
                          <div className="pointer-events-none relative min-w-0">
                            <p className="font-semibold text-brand-950 truncate text-base">
                              {it.productName}
                              {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                            </p>
                            {it.modifiers.length > 0 && (
                              <p className="text-brand-950/50 truncate text-xs">{it.modifiers.map(formatModifierLabel).join(', ')}</p>
                            )}
                            <p className="text-brand-950/50 text-xs">{it.unitPrice} c/u</p>
                          </div>
                          <div className="relative z-10 flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleDelivered(it)}
                              aria-pressed={delivered}
                              disabled={togglingDeliveredId === it.id}
                              className={`text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                                delivered
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-brand-950/[0.05] text-brand-950/50 border border-transparent hover:bg-brand-950/10'
                              }`}
                            >
                              {delivered ? '✓ Entregado' : 'Marcar entregado'}
                            </button>
                            <button
                              type="button"
                              onClick={() => requestQtyDecrease(it)}
                              disabled={editorBusy || needsCorrection || !!order.fiscalPrintedAt}
                              className="rounded-full px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-30"
                              aria-label={`Quitar ${it.productName} con motivo`}
                            >Quitar</button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`Reducir ${it.productName} con motivo`}
                                onClick={() => requestQtyDecrease(it)}
                                disabled={editorBusy || needsCorrection || !!order.fiscalPrintedAt}
                                className="w-10 h-10 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm font-bold">{it.quantity}</span>
                              <button
                                onClick={() => setQty(it.id, it.quantity + 1)}
                                disabled={editorBusy || needsCorrection || !!order.fiscalPrintedAt}
                                className="w-10 h-10 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    }} />
                </div>

                {pendingLinesPanel}

                <div className="text-sm text-brand-950/70 space-y-1.5 rounded-2xl bg-brand-950/[0.03] px-4 py-3">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatBase(order.subtotalBase, symbol)}</span>
                  </div>
                  {Number(order.ivaBase) > 0 && (
                    <div className="flex justify-between">
                      <span>IVA</span>
                      <span>{formatBase(order.ivaBase, symbol)}</span>
                    </div>
                  )}
                  {Number(order.serviceChargeBase) > 0 && (
                    <div className="flex justify-between">
                      <span>Servicio</span>
                      <span>{formatBase(order.serviceChargeBase, symbol)}</span>
                    </div>
                  )}
                  {Number(order.deliveryFeeBase) > 0 && (
                    <div className="flex justify-between">
                      <span>Envío</span>
                      <span>{formatBase(order.deliveryFeeBase, symbol)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-semibold text-brand-950 pt-2 border-t border-brand-950/10">
                    <span className="text-base text-brand-950/60">Total</span>
                    <span className="text-4xl font-bold tabular-nums">{formatBase(order.totalBase, symbol)}</span>
                  </div>
                  <div className="flex justify-between text-brand-950/50">
                    <span>Equivalente en Bs</span>
                    <span className="font-semibold tabular-nums">{formatBsAbsolute(order.totalBs)}</span>
                  </div>
                </div>

                {error && <p className="text-red-600 text-base">{error}</p>}

                <section className="order-documents" aria-label="Documentos y envío del pedido">
                  <p className="order-documents-heading">Documentos y envío</p>
                  <div className="order-document-grid">
                    <button type="button" className="order-document-action" disabled={printing} onClick={printComanda}>
                      <Printer aria-hidden="true" /><span>{printing ? 'Imprimiendo…' : 'Comanda'}</span>
                    </button>
                    <button type="button" className="order-document-action" aria-expanded={showReciboMenu} onClick={() => setShowReciboMenu(s => !s)}>
                      <Receipt aria-hidden="true" /><span>Nota de entrega</span>
                    </button>
                    {Boolean(restaurant?.rif?.trim()) && (
                      <button type="button" className="order-document-action" onClick={() => setShowFiscalDialog(true)}>
                        <Receipt aria-hidden="true" /><span>{order.fiscalPrintedAt ? `Fiscal ${order.fiscalPrinterInvoice}` : 'Factura fiscal'}</span>
                      </button>
                    )}
                    <OrderWhatsappButton order={order} business={restaurant?.name ?? ''} buttonClassName="order-document-action order-document-action--whatsapp" />
                    {!isMesa && (
                      <button type="button" className="order-document-action" disabled={downloading} onClick={downloadJpg}>
                        <Download aria-hidden="true" /><span>{downloading ? 'Generando…' : 'Descargar'}</span>
                      </button>
                    )}
                    {order.channel === 'DELIVERY' && (
                      <button type="button" className="order-document-action" disabled={dispatching} onClick={handleDeliveryClick}>
                        <Truck aria-hidden="true" /><span>{dispatching ? 'Despachando…' : 'Delivery'}</span>
                      </button>
                    )}
                  </div>
                  {showReciboMenu && (
                    <button type="button" onClick={printReceiptFull} disabled={printingReceipt} className="order-document-print">
                      <Printer className="h-4 w-4" aria-hidden="true" /> {printingReceipt ? 'Imprimiendo…' : 'Imprimir nota de entrega'}
                    </button>
                  )}
                </section>

                {openDelivery && canCorrectOrder && !needsCorrection && <DeliveryPaymentPreference order={order} onSaved={onSaved} />}
                <OrderPaymentSummary order={order} symbol={symbol} />
                {openDelivery && canCorrectOrder && !needsCorrection && order.payments.some(p=>Number(p.amountBase)>0) && <button type="button" disabled={editorBusy || pendingLines.length>0} onClick={()=>setShowCorrection(true)} className="min-h-11 rounded-xl border border-brand-950/15 px-4 py-2 text-sm font-semibold text-brand-600">Corregir pago registrado</button>}
                {canManageIncomingOrders(user?.role) && <FinalizeDeliveryButton order={order} disabled={editorBusy || pendingLines.length > 0 || name !== (order.customerName ?? '') || phone !== (order.customerPhone ?? '') || address !== (order.customerAddress ?? '') || note !== (order.customerNote ?? '')} onFinalized={() => { onSaved(); onClose(); }} />}

                {isMesa ? (
                  <p className={`text-sm font-medium text-center ${fullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {fullyPaid ? '✓ Pagado' : 'Pendiente de pago'}
                  </p>
                ) : fullyPaid ? (
                  <p className="text-emerald-600 font-medium text-center text-base">✓ Pagado</p>
                ) : (
                  // Un solo botón: el propio diálogo de cobro ya deja elegir completo,
                  // fraccionado o deuda (ver PaymentDialog).
                  <button type="button" disabled={pendingLines.length > 0 || editorBusy} onClick={() => setPaymentMode('full')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
                    <CreditCard className="h-5 w-5" aria-hidden="true" /> {order.payments.length > 0 ? `Pagar saldo · ${formatBase(balanceBase, symbol)}` : 'Pagar'}
                  </button>
                )}
                {pendingLines.length > 0 && <p className="text-brand-950/60 text-xs">Confirma los productos nuevos antes de cobrar.</p>}
                <div className={`grid items-stretch gap-2 ${canLeavePending && canDeleteOrder ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {canLeavePending && <button type="button" disabled={markingDebt} onClick={markDebt} className="min-h-11 min-w-0 rounded-xl border border-brand-950/10 px-2 py-2.5 text-xs font-medium text-brand-950/70 disabled:opacity-50">{markingDebt ? 'Guardando…' : 'Dejar pendiente'}</button>}
                  {deleteOrderButton}
                </div>
              </div>
        </div>
        <div className="shrink-0 border-t border-brand-950/10 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <button type="button" onClick={() => setMobileSummary(value => !value)} className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${pendingLines.length > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-brand-950/[0.04] text-brand-950'}`}>
            <span>{mobileSummary ? 'Volver al menú' : `Ver pedido · ${order.items.reduce((total, item) => total + item.quantity, 0)} ítems`}{pendingLines.length > 0 ? ` · ${pendingLines.reduce((total, line) => total + line.quantity, 0)} por confirmar` : ''}</span><span>{formatBase(order.totalBase, symbol)}</span>
          </button>
          {error && !mobileSummary && <p role="alert" className="mt-2 text-red-600 text-base">{error}</p>}
        </div>

        <div className="fixed -left-[9999px] top-0">
          <ComandaReceipt ref={receiptRef} order={order} restaurantName={restaurant?.name ?? ''} />
        </div>
      </DialogContent>

      {confirmClose && <Dialog open onOpenChange={setConfirmClose}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Hay cambios sin guardar</DialogTitle></DialogHeader><p className="text-brand-950/60 text-base">Guarda los datos del cliente o confirma los productos nuevos antes de salir. Los cambios que ya guardaste se conservan.</p><TextureButton variant="brand" onClick={() => setConfirmClose(false)}>Seguir editando</TextureButton><TextureButton variant="secondary" onClick={onClose}>Salir y descartar lo pendiente</TextureButton></DialogContent></Dialog>}

      {optionsProduct &&
        (() => {
          const initial = editingItem ? initialSelectionFor(editingItem, optionsProduct) : null;
          return (
            <ProductOptionsDialog
              product={optionsProduct}
              currencySymbol={symbol}
              initialVariantId={initial?.variantId}
              initialModifierIds={initial?.modifierIds}
              initialQuantity={editingItem?.quantity}
              initialNote={editingItem?.note ?? undefined}
              confirmLabel={editingItem ? 'Guardar cambios' : undefined}
              onClose={() => {
                setOptionsProduct(null);
                setEditingItem(null);
              }}
              onAdd={(line) => {
                if (editingItem) { setReplacement({ itemId: editingItem.id, line }); setReplacementReason(''); }
                else queueProductLine(line);
                setOptionsProduct(null);
                setEditingItem(null);
              }}
            />
          );
        })()}

      {showFiscalDialog && Boolean(restaurant?.rif?.trim()) && (
        <FiscalInvoiceDialog
          order={order}
          currencySymbol={symbol}
          onClose={() => setShowFiscalDialog(false)}
          onEmitted={onSaved}
        />
      )}

      {paymentMode && (
        <PaymentDialog
          order={order}
          mode={paymentMode}
          onClose={() => setPaymentMode(null)}
          onPaid={(fullyPaid) => {
            if (
              fullyPaid && !order.placedByUser &&
              (order.channel === 'DELIVERY' || order.channel === 'PICKUP') &&
              (order.status === 'PENDING' || order.status === 'NEEDS_CONFIRMATION')
            ) {
              api
                .post(`/orders/${order.id}/accept`)
                .then(() => autoDispatchAfterPayment())
                .catch((e: any) => setError(e.response?.data?.error ?? 'El pago se registró, pero no se pudo enviar a cocina.'))
                .finally(onSaved);
            } else {
              onSaved();
              if (fullyPaid) autoDispatchAfterPayment();
            }
          }}
        />
      )}

      {showCourierPicker && (
        <CourierPickerDialog
          open
          couriers={couriers}
          busy={dispatching}
          onPick={dispatchCourier}
          onClose={() => setShowCourierPicker(false)}
        />
      )}

      {deletePromptOpen && (
        <DeleteOrderDialog
          order={order}
          role={user?.role}
          onClose={() => setDeletePromptOpen(false)}
          onDeleted={() => {
            setDeletePromptOpen(false);
            onClose();
            onSaved();
          }}
        />
      )}

      {returnPromptFor && (
        <Dialog open onOpenChange={(o) => !o && setReturnPromptFor(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{returnPromptFor.deliveredAt ? 'Devolver' : 'Quitar'} "{returnPromptFor.productName}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-brand-950/60 font-light text-base">
                Indica por qué se reduce la comanda. Quedará registrado con el usuario, la hora,
                la cantidad y el monto; si ya fue entregado también aparecerá como merma.
              </p>
              {(() => {
                const maxReturnable = Math.max(1, returnPromptFor.quantity - returnPromptFor.paidQuantity);
                return maxReturnable > 1 ? (
                  <div className="flex items-center justify-between rounded-xl border border-brand-950/10 px-3 py-2">
                    <span className="text-sm font-medium text-brand-950/70">Cantidad a devolver</span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setReturnQty((q) => Math.max(1, q - 1))}
                        disabled={returnQty <= 1}
                        className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{returnQty}</span>
                      <button
                        type="button"
                        onClick={() => setReturnQty((q) => Math.min(maxReturnable, q + 1))}
                        disabled={returnQty >= maxReturnable}
                        className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="space-y-1.5">
                {RETURN_REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      returnReason === r ? 'border-brand-500 bg-brand-500/5' : 'border-brand-950/10 hover:border-brand-950/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="returnReason"
                      checked={returnReason === r}
                      onChange={() => setReturnReason(r)}
                    />
                    {RETURN_REASON_LABELS[r]}
                  </label>
                ))}
              </div>
              <textarea
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                aria-label="Motivo de la eliminación"
                maxLength={300}
                placeholder="Escribe el motivo de la eliminación"
                rows={2}
                className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 resize-none text-base"
              />
              {returnError && <p className="text-red-600 text-base">{returnError}</p>}
              <div className="flex gap-2">
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={returning || returnNote.trim().length < 3}
                  onClick={confirmReturn}
                  className="disabled:opacity-50"
                >
                  {returning ? 'Registrando…' : 'Confirmar eliminación'}
                </TextureButton>
                <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setReturnPromptFor(null)}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {removePromptFor && (
        <Dialog open onOpenChange={(open) => !open && setRemovePromptFor(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Quitar unidades de {removePromptFor.productName}</DialogTitle>
            </DialogHeader>
            <p className="text-brand-950/60 text-base">Hay {removePromptFor.quantity} en esta línea. Elige cuántas quieres quitar de la cuenta.</p>
            <div className="flex items-center justify-center gap-5 py-3">
              <button type="button" aria-label="Quitar una unidad menos" disabled={removeQty <= 1} onClick={() => setRemoveQty((q) => q - 1)} className="h-10 w-10 rounded-full border border-brand-950/20 text-xl disabled:opacity-30">−</button>
              <span className="min-w-8 text-center text-xl font-bold text-brand-950">{removeQty}</span>
              <button type="button" aria-label="Quitar una unidad más" disabled={removeQty >= removePromptFor.quantity} onClick={() => setRemoveQty((q) => q + 1)} className="h-10 w-10 rounded-full border border-brand-950/20 text-xl disabled:opacity-30">+</button>
            </div>
            <div className="flex gap-2">
              <TextureButton variant="brand" size="default" onClick={confirmRemoveQuantity}>Quitar {removeQty} de la cuenta</TextureButton>
              <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setRemovePromptFor(null)}>Cancelar</TextureButton>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {replacement && <Dialog open onOpenChange={open => { if (!open && !saving) setReplacement(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar cambio de producto</DialogTitle></DialogHeader>
          <p className="text-brand-950/60 text-base">Se sustituirá el producto anterior por {replacement.line.quantity} × {replacement.line.product.name}. El motivo quedará registrado.</p>
          <textarea aria-label="Motivo del cambio de producto" placeholder="Ej. El cliente pidió otro tamaño" value={replacementReason} onChange={event => setReplacementReason(event.target.value)} maxLength={300} className="min-h-24 rounded-xl border border-brand-950/15 p-3 text-base" />
          {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
          <TextureButton variant="brand" disabled={saving || replacementReason.trim().length < 3} onClick={() => replaceItemWithLine(replacement.itemId, replacement.line)}>{saving ? 'Guardando…' : 'Guardar cambio'}</TextureButton>
        </DialogContent>
      </Dialog>}

      <Toast message={toastMessage} />
    </Dialog>
  );
}
