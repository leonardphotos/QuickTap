import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import {
  Check,
  ChefHat,
  ChevronLeft,
  Clock,
  CreditCard,
  Download,
  History,
  MessageCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  SplitSquareHorizontal,
  Truck,
  X,
} from 'lucide-react';
import { api, getToken } from '@/api/client';
import type { CartLine, DeliveryCourier, Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { CourierPickerDialog } from '@/components/admin/CourierPickerDialog';
import { CreateOrderDialog } from './CreateOrderDialog';
import { PaymentDialog } from './PaymentDialog';
import { ComandaReceipt } from './ComandaReceipt';
import { ProductOptionsDialog } from './ProductOptionsDialog';
import { useAuth } from '@/context/AuthContext';
import { isAdminCashier } from '@/utils/roles';
import { hasFeature } from '@/utils/subscription';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/ui/toast';
import { abbreviateTableBadge, CURRENCY_SYMBOLS, formatBase, formatBsAbsolute, formatModifierLabel } from '@/utils/format';
import { settledOf } from '@/utils/orderBalance';
import { useIsLandscapeTablet } from '@/hooks/useIsLandscapeTablet';

interface DeletionLogEntry {
  id: string;
  orderNumber: number;
  channel: string;
  status: string;
  tableName: string | null;
  customerName: string | null;
  totalBase: number;
  items: { name: string; quantity: number; variantName?: string | null; modifiers?: { name: string; quantity: number }[] }[];
  deletedByName: string;
  deletedByRole: string;
  deletedAt: string;
}

interface LiveOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  variantName?: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  // Cuánto de esta línea ya se cobró (fraccionar pago por ítems). 0 si nunca se ha usado esa modalidad.
  paidQuantity: number;
  modifiers: { name: string; priceBase: string; quantity: number }[];
  note?: string | null;
  // Cuándo el mesero lo marcó "Entregado" — condición para pedir motivo al devolverlo
  // (ver returnItem en el backend); null = todavía no salió a la mesa/cliente.
  deliveredAt?: string | null;
}

export interface LiveOrderPayment {
  id: string;
  amountBase: string;
  method: string;
  discountBase?: string | null;
  serviceChargeDiscountBase?: string | null;
  // Propina cobrada EN este pago puntual — aparte de amountBase (ver orderBalance.ts: nunca
  // cuenta para el saldo de la venta).
  tipBase?: string | null;
  referenceNumber?: string | null;
  proofImageUrl?: string | null;
  // Vuelto: efectivo entregado por el cliente y cambio devuelto (por qué método).
  amountReceivedBase?: string | null;
  changeBase?: string | null;
  changeMethod?: string | null;
  createdAt: string;
}

export interface LiveOrder {
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
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

type ChannelFilter = LiveOrder['channel'] | 'NEW' | 'AWAITING_PAYMENT' | 'PAID' | 'PARTIAL';

/** Estado de pago de un pedido, para colorear la tarjeta y filtrar el Dashboard. */
export function getPaymentStatus(o: LiveOrder) {
  // Un descuento (y el ajuste de servicio) perdona esa parte de la deuda: cuenta como
  // "saldado" igual que el efectivo cobrado — misma cuenta que hace el backend.
  const paidBase = settledOf(o.payments);
  const balanceBase = Math.max(0, Number(o.totalBase) - paidBase);
  const owesBalance = paidBase > 0 && balanceBase > 0.01;
  const fullyPaid = o.payments.length > 0 && balanceBase <= 0.01;
  return { paidBase, balanceBase, owesBalance, fullyPaid };
}

/** Necesita abrir el selector de variante/modificadores en vez de añadirse directo. Incluye
 * categorías opcionales (no solo obligatorias) para que, al editar un ítem ya pedido, se puedan
 * ajustar también los extras opcionales — no solo los que son obligatorios al crear el pedido. */
function needsPicker(product: Product): boolean {
  return product.pricingMode === 'VARIANTS' || (product.modifierCategories ?? []).length > 0;
}

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Resumen "hace X min" para la tarjeta compacta de celular. */
/** Filtra cuentas por pagar por nombre o teléfono del cliente. Ignora tildes/mayúsculas para
 * que "jose" encuentre "José"; el teléfono compara solo dígitos, para que buscar "04121234567"
 * encuentre un número guardado como "0412-123-4567". */
function filterByDebtSearch(orders: LiveOrder[], query: string): LiveOrder[] {
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

/**
 * Resultado de un endpoint que intenta mandar el mensaje por el chatbot de WhatsApp vinculado
 * (ver whatsapp-bot.service.ts) y cae a un enlace wa.me si no está conectado: si `sent` es true
 * ya salió solo (cierra la pestaña en blanco que se pre-abrió por el bloqueador de popups y
 * muestra el aviso de confirmación); si no, abre esa pestaña con el enlace de siempre.
 */
export function handleWhatsappSendResult(win: Window | null, data: { sent?: boolean; url?: string }, onSent: () => void) {
  if (data.sent) {
    win?.close();
    onSent();
    return;
  }
  if (data.url) {
    openInTabAndAutoClose(win, data.url);
  } else {
    win?.close();
  }
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
  NEEDS_CONFIRMATION: { label: 'Nueva', bg: '#fbedd6', fg: '#8a5106' },
  // Pedido de kiosco (rol Comanda): espera que caja lo cobre antes de ir a cocina.
  NEEDS_PAYMENT: { label: 'Por cobrar · Autoservicio', bg: '#fbedd6', fg: '#8a5106' },
  PENDING: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  KITCHEN: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  SERVED: { label: 'Servido', bg: '#e3f5ec', fg: '#0f6e46' },
  CANCELLED: { label: 'Cancelado', bg: '#f1f4f9', fg: '#5b6785' },
};

const CHANNEL_TABS: { value: LiveOrder['channel']; label: string }[] = [
  { value: 'DINE_IN', label: 'Mesas' },
  { value: 'BAR', label: 'Barra' },
  { value: 'EXPRESS', label: 'Express' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'PICKUP', label: 'Pick-up' },
];

interface LiveOrdersPanelProps {
  /** El dashboard de Mesero ya tiene su propio botón flotante "Crear pedido" (fijo abajo a la
   * izquierda, visible en todas sus pestañas) — se oculta este para no duplicarlo en Comandas. */
  hideCreateButton?: boolean;
  /** Permite abrir "Crear pedido" desde un botón de fuera (el Dashboard lo tiene arriba, sobre
   * "Ventas de hoy"). Si se pasa, el diálogo queda controlado por el padre; si no, se maneja acá. */
  createOrderOpen?: boolean;
  onCreateOrderOpenChange?: (open: boolean) => void;
}

// Cocina nunca acepta pedidos; Delivery/Pickup solo lo acepta Caja/Admin/Dueño
// (implica coordinar cobro/despacho antes de mandarlo a cocina).
function canAcceptOrder(role: string | undefined, channel: LiveOrder['channel'], cashierFullAccess?: boolean): boolean {
  if (role === 'KITCHEN') return false;
  if (channel === 'DELIVERY' || channel === 'PICKUP') return isAdminCashier(role as any, cashierFullAccess);
  return true;
}

/**
 * Qué pedidos le tocan a un Mesero. Fuente única: la usan el panel de Pedidos y la vista
 * previa de comandas del mesero, que antes llevaban dos copias del mismo criterio.
 *
 * Solo lo suyo: los que él mismo tomó, los que aceptó de un cliente que pidió desde su mesa,
 * y los de una mesa que tiene asignada (Equipo → "Asignar mesas", o porque aceptó el primer
 * pedido de esa mesa). Nada más.
 *
 * Antes también veía TODAS las comandas de barra y cualquier pedido sin dueño, con la idea de
 * que ninguna cuenta quedara sin mesero que la cobrara. En la práctica eso llenaba su pantalla
 * de comandas ajenas y se prestaba a confusión, así que se quitó a propósito. La contrapartida
 * es que barra y los pedidos que llegan a una mesa sin mesero asignado quedan a la vista de
 * Caja/Admin, que son quienes los reparten: para que un mesero los vea, hay que asignarle la
 * mesa (Equipo → "Asignar mesas") o que él mismo tome la comanda.
 */
export function leCorresponde(o: LiveOrder, userId: string): boolean {
  if (o.placedByUser?.id === userId) return true;
  if (o.acceptedByUserId === userId) return true;
  return o.table?.assignedWaiterId === userId;
}

/** Panel "Pedidos": todos los pedidos activos con Aceptar/Cancelar/Finalizar/Delivery. Va en el Dashboard. */
export function LiveOrdersPanel({
  hideCreateButton,
  createOrderOpen: controlledCreateOrderOpen,
  onCreateOrderOpenChange,
}: LiveOrdersPanelProps = {}) {
  const { restaurant, user } = useAuth();
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const { show, toastMessage } = useToast();
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [courierPickerFor, setCourierPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter | null>(null);
  // Solo aplica dentro de "Deudas": ahí la lista puede crecer sin límite (una cuenta sin
  // pagar ya no se corta por antigüedad, ver order.service.ts), así que buscar por nombre o
  // teléfono es lo que la hace usable con muchas cuentas viejas acumuladas.
  const [debtSearch, setDebtSearch] = useState('');
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [uncontrolledCreateOrderOpen, setUncontrolledCreateOrderOpen] = useState(false);
  const createOrderOpen = controlledCreateOrderOpen ?? uncontrolledCreateOrderOpen;
  const setCreateOrderOpen = onCreateOrderOpenChange ?? setUncontrolledCreateOrderOpen;
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  const [comandaMenuFor, setComandaMenuFor] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);
  // Registro permanente de comandas eliminadas — solo Dueño/Admin (el backend además lo exige).
  const [deletionLogOpen, setDeletionLogOpen] = useState(false);
  const [deletionLog, setDeletionLog] = useState<DeletionLogEntry[] | null>(null);
  // Mesero: eliminar una comanda exige el código de 6 dígitos creado en Ajustes (ver deleteOrderHard en el backend).
  /**
   * Cuántas tarjetas se PINTAN de una. La lista nunca corta pedidos —un impago no puede
   * desaparecer (ver listLiveOrders)— pero pintar cientos de tarjetas de golpe traba un
   * teléfono de gama baja. En un local que no registra pagos son 443 pedidos abiertos; con
   * esto se pintan los primeros y el resto entra con el botón, con el total siempre a la vista.
   */
  const [tarjetasVisibles, setTarjetasVisibles] = useState(40);
  const [pinPromptFor, setPinPromptFor] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  // Una sola columna con texto en celular; en pantallas anchas siempre cuadrícula
  // compacta (solo iconos) para aprovechar el espacio — ya no es una opción manual.
  const actionBtnClass = 'text-xs font-medium py-3 lg:text-[10.5px] lg:py-2.5 lg:px-0.5 lg:leading-tight';

  function load() {
    api.get('/orders/live', { params: { incluirPagadas: '1' } }).then((res) => setOrders(res.data.data));
  }

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
      load();
    }, 700);
  }

  useEffect(() => {
    load();
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

  async function toggleAwaitingPayment(id: string, awaitingPayment: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/orders/${id}/awaiting-payment`, { awaitingPayment });
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo actualizar la cuenta por pagar.');
    } finally {
      setBusyId(null);
    }
  }

  /** Botón "Imprimir" del menú Comanda: no imprime desde este navegador — reenvía la
   * comanda a la estación de impresión (print-station), que es quien tiene las impresoras. */
  async function printComanda(orderId: string) {
    setPrintingId(orderId);
    setError(null);
    try {
      const o = orders?.find((x) => x.id === orderId);
      if (o && (o.status === 'PENDING' || o.status === 'NEEDS_CONFIRMATION')) {
        // Si ya se aceptó justo antes (doble click), el 400 de "ya no está pendiente" no debe frenar la impresión.
        await api.post(`/orders/${orderId}/accept`).catch(() => {});
      }
      await api.post(`/orders/${orderId}/print-comanda`);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda a la estación de impresión.');
    } finally {
      setPrintingId(null);
      setComandaMenuFor(null);
    }
  }

  async function sendWhatsapp(order: LiveOrder) {
    // Abrir la pestaña ANTES del await: si se abre después de esperar la respuesta del
    // servidor, el navegador pierde el contexto de "acción del usuario" y bloquea el popup.
    const win = window.open('', '_blank');
    setSendingWhatsappId(order.id);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${order.id}/send-whatsapp`);
      handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
    } catch (e: any) {
      win?.close();
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda por WhatsApp.');
    } finally {
      setSendingWhatsappId(null);
      setComandaMenuFor(null);
    }
  }

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
    // El Mesero necesita el código de 6 dígitos de Ajustes (ver deleteOrderHard en el
    // backend); pedirlo ya es la confirmación, así que no hace falta el confirm() de abajo.
    if (user?.role === 'WAITER') {
      setPinInput('');
      setPinError(null);
      setPinPromptFor(id);
      return;
    }
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

  async function confirmCancelWithPin() {
    if (!pinPromptFor) return;
    setBusyId(pinPromptFor);
    setPinError(null);
    try {
      await api.delete(`/orders/${pinPromptFor}`, { data: { pin: pinInput } });
      setPinPromptFor(null);
      load();
    } catch (e: any) {
      setPinError(e.response?.data?.error ?? 'No se pudo cancelar el pedido.');
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
        if (data.data?.url || data.data?.sent) {
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
  const sinCobrar = (lista: LiveOrder[]) => lista.filter((o) => !getPaymentStatus(o).fullyPaid);

  const visibleOrders = !channelFilter
    ? sinCobrar(roleFiltered ?? [])
    : channelFilter === 'NEW'
      ? // "Nuevas": lo que entró y todavía nadie aceptó — la bandeja de entrada del turno.
        sinCobrar(roleFiltered ?? []).filter((o) => o.status === 'PENDING' || o.status === 'NEEDS_CONFIRMATION')
      : channelFilter === 'AWAITING_PAYMENT'
        ? filterByDebtSearch(sinCobrar(roleFiltered ?? []).filter((o) => o.awaitingPayment), debtSearch)
        : channelFilter === 'PAID'
          ? filterByDebtSearch((roleFiltered ?? []).filter((o) => getPaymentStatus(o).fullyPaid), debtSearch)
          : channelFilter === 'PARTIAL'
            ? sinCobrar(roleFiltered ?? []).filter((o) => getPaymentStatus(o).owesBalance)
            : sinCobrar(roleFiltered ?? []).filter((o) => o.channel === channelFilter);

  if (!orders) return null;

  const filterOptions: { value: ChannelFilter | null; label: string }[] = [
    { value: 'NEW', label: 'Nuevas' },
    ...CHANNEL_TABS,
    ...(canAccountsPayable ? [{ value: 'AWAITING_PAYMENT' as const, label: 'Deudas' }] : []),
    { value: 'PAID', label: 'Pagadas' },
    { value: 'PARTIAL', label: 'Fraccionado' },
    { value: null, label: 'Todas' },
  ];

  return (
    <div className="w-full mb-8 max-w-md mx-auto lg:max-w-none lg:mx-0">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold text-brand-950">Pedidos</h2>
          {(visibleOrders?.length ?? 0) > 0 && (
            <span className="text-sm bg-brand-500 text-white rounded-full h-7 min-w-7 px-2 flex items-center justify-center font-bold">
              {visibleOrders?.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
            <button
              onClick={() => {
                setDeletionLogOpen(true);
                api.get('/orders/deletion-log').then((res) => setDeletionLog(res.data.data));
              }}
              className="flex items-center gap-1 text-xs font-medium text-brand-950/50 hover:text-brand-950 border border-brand-950/15 rounded-full px-3 py-2"
              title="Registro de comandas eliminadas"
            >
              <History className="h-3.5 w-3.5" /> Eliminadas
            </button>
          )}
          {!hideCreateButton && (
            <TextureButton
              variant="success"
              size="default"
              className="!w-auto flex items-center gap-1.5 shrink-0"
              onClick={() => setCreateOrderOpen(true)}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Crear pedido
            </TextureButton>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
        {filterOptions.map((f) => (
          <button
            key={f.label}
            onClick={() => {
              setChannelFilter(f.value);
              // Cada pestaña arranca con su primer bloque de tarjetas: si no, un "Ver más"
              // dado en Deudas hacía que "Pagadas" pintara de golpe cientos de tarjetas.
              setTarjetasVisibles(40);
            }}
            // Rectangulares y con área de toque cómoda: se usan con el dedo en la tablet del
            // mostrador, y como píldoras chicas costaba acertarle a la pestaña de al lado.
            className={`shrink-0 text-sm font-semibold px-4 py-3 rounded-lg border transition-colors ${
              channelFilter === f.value
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-brand-950/60 border-brand-950/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(channelFilter === 'AWAITING_PAYMENT' || channelFilter === 'PAID') && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
          <input
            value={debtSearch}
            onChange={(e) => setDebtSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full text-sm rounded-xl border border-brand-950/15 bg-white pl-9 pr-9 py-2 outline-none focus:border-brand-500"
          />
          {debtSearch && (
            <button
              onClick={() => setDebtSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-950/30 hover:text-brand-950/60"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3 text-left">{error}</p>}

      {visibleOrders?.length === 0 ? (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-6 text-center">
          <p className="text-sm text-brand-950/40 font-light">No hay pedidos activos.</p>
        </div>
      ) : (
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-3 lg:items-start">
          {visibleOrders?.slice(0, tarjetasVisibles).map((o) => {
            const { balanceBase, owesBalance, fullyPaid } = getPaymentStatus(o);
            return (
            <div
              key={o.id}
              onClick={() => setEditingOrder(o)}
              className={`relative rounded-2xl border shadow-sm p-4 text-left cursor-pointer hover:shadow-md transition-shadow ${
                fullyPaid ? 'border-emerald-300 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'
              }`}
            >
              {(() => {
                const statusMeta = STATUS_META[o.status] ?? { label: STATUS_LABELS[o.status] ?? o.status, bg: '#eef3fc', fg: 'var(--color-brand-950)' };
                return (
                  <div className="flex items-start gap-3 mb-2">
                    <div
                      className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center font-semibold text-[13px] shrink-0"
                      style={{ background: statusMeta.bg, color: statusMeta.fg }}
                    >
                      {o.channel === 'DINE_IN' && o.table ? abbreviateTableBadge(o.table.number) : '—'}
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
                        #{o.orderNumber} · {exactDateTime(o.createdAt)}
                        {o.customerName && ` · ${o.customerName}`}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* En celular la tarjeta es solo un resumen — todas las acciones (pagar,
                  imprimir, aceptar/cancelar, etc.) viven en la hoja de "Editar pedido"
                  que se abre al tocarla. En escritorio se mantiene la tarjeta completa. */}
              <p className="lg:hidden text-xs text-brand-950/50 truncate">
                {o.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ') || 'Sin productos'} ·{' '}
                {exactDateTime(o.createdAt)} ({timeAgo(o.createdAt)})
              </p>

              <div className="hidden lg:block">
              <ul className="text-sm space-y-0.5 font-light mb-2">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.map(formatModifierLabel).join(', ')})</span>
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

              <div
                className={o.channel === 'DELIVERY' ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-4 gap-1.5'}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => accept(o.id)}
                  disabled={
                    busyId === o.id ||
                    (o.status !== 'PENDING' && o.status !== 'NEEDS_CONFIRMATION') ||
                    !canAcceptOrder(user?.role, o.channel, user?.cashierFullAccess)
                  }
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
                {o.channel !== 'DELIVERY' && (
                  <button
                    disabled
                    title="Delivery"
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-950 text-white ${actionBtnClass} opacity-40`}
                  >
                    <Truck className="h-4 w-4" /> <span className="lg:hidden">Delivery</span>
                  </button>
                )}
              </div>
              {o.channel === 'DELIVERY' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeliveryClick(o);
                  }}
                  disabled={busyId === o.id}
                  className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-xl bg-brand-950 hover:bg-brand-900 text-white py-3 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Truck className="h-5 w-5" /> Delivery
                </button>
              )}

              {fullyPaid ? (
                <p className="text-xs text-emerald-600 font-medium text-center mt-2">✓ Pagado</p>
              ) : (
                <div
                  className={`grid ${canAccountsPayable ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 mt-2`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'full' })}
                    title="Pagar"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
                  >
                    <CreditCard className="h-4 w-4" /> <span className="lg:hidden">Pagar</span>
                  </button>
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'split' })}
                    title="Pago fraccionado"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
                  >
                    <SplitSquareHorizontal className="h-4 w-4" /> <span className="lg:hidden">Fraccionado</span>
                  </button>
                  {canAccountsPayable && (
                    <button
                      onClick={() => toggleAwaitingPayment(o.id, !o.awaitingPayment)}
                      disabled={busyId === o.id}
                      title={o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl text-white text-xs font-medium py-2.5 transition-colors disabled:opacity-40 ${
                        o.awaitingPayment ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                    >
                      <Clock className="h-4 w-4" /> <span className="lg:hidden">{o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setComandaMenuFor(comandaMenuFor === o.id ? null : o.id)}
                    title="Comanda"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
                  >
                    <Receipt className="h-4 w-4" /> <span className="lg:hidden">Comanda</span>
                  </button>
                </div>
              )}

              {comandaMenuFor === o.id && (
                <div className="grid grid-cols-2 gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => printComanda(o.id)}
                    disabled={printingId === o.id}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                  >
                    <Printer className="h-3.5 w-3.5" /> {printingId === o.id ? 'Enviando…' : 'Imprimir'}
                  </button>
                  <button
                    onClick={() => sendWhatsapp(o)}
                    disabled={sendingWhatsappId === o.id || !o.customerPhone}
                    title={o.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsappId === o.id ? 'Enviando…' : 'WhatsApp'}
                  </button>
                </div>
              )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* El resto sigue cargado en memoria: esto solo controla cuántas tarjetas se pintan. */}
      {visibleOrders && visibleOrders.length > tarjetasVisibles && (
        <button
          type="button"
          onClick={() => setTarjetasVisibles((n) => n + 40)}
          className="mt-3 w-full rounded-xl border border-brand-950/10 bg-white py-2.5 text-sm font-medium text-brand-950/60 hover:bg-brand-950/[0.03]"
        >
          Ver más pedidos ({visibleOrders.length - tarjetasVisibles} restantes)
        </button>
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
          onPaid={(fullyPaid) => {
            const paidOrder = paymentDialog.order;
            load();
            if (fullyPaid) autoDispatchAfterPayment(paidOrder);
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

      {pinPromptFor && (
        <Dialog open onOpenChange={(open) => !open && setPinPromptFor(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Código para eliminar comanda</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-brand-950/60 font-light">
                Pide el código de 6 dígitos al dueño o administrador para eliminar este pedido.
              </p>
              <input
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="Código de 6 dígitos"
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              {pinError && <p className="text-sm text-red-600">{pinError}</p>}
              <TextureButton
                variant="brand"
                size="default"
                disabled={busyId === pinPromptFor || pinInput.length !== 6}
                onClick={confirmCancelWithPin}
                className="disabled:opacity-50"
              >
                {busyId === pinPromptFor ? 'Eliminando…' : 'Eliminar comanda'}
              </TextureButton>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {deletionLogOpen && (
        <Dialog open onOpenChange={(open) => !open && setDeletionLogOpen(false)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comandas eliminadas</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-brand-950/50 font-light -mt-1 mb-2">
              Registro permanente: cada comanda borrada queda aquí con quién la borró. No se puede eliminar.
            </p>
            {!deletionLog ? (
              <p className="text-sm text-brand-950/50">Cargando…</p>
            ) : deletionLog.length === 0 ? (
              <p className="text-sm text-brand-950/50">Ninguna comanda ha sido eliminada.</p>
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
                    <p className="text-xs text-brand-950/60 mt-0.5">
                      {r.items.map((it) => `${it.quantity}x ${it.name}${it.variantName ? ` (${it.variantName})` : ''}`).join(', ')}
                    </p>
                    <p className="text-xs text-red-600/80 mt-1.5">
                      Eliminada por <span className="font-semibold">{r.deletedByName}</span> ({r.deletedByRole}) ·{' '}
                      {new Date(r.deletedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

/** En modo POS agrupa su contenido en una columna (una división real del layout de dos
 * columnas); en el resto de los casos lo deja tal cual — un Fragment no añade ningún nodo,
 * así que los hijos siguen siendo hermanos directos del contenedor `space-y-4` de siempre. */
function PosCol({ isPos, className, children }: { isPos: boolean; className: string; children: ReactNode }) {
  return isPos ? <div className={className}>{children}</div> : <>{children}</>;
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
  // Tablet en horizontal sobre el mostrador: la ficha pasa a pantalla completa en dos columnas
  // (productos a la izquierda, montos y acciones a la derecha) — mismo criterio que
  // PaymentDialog/CreateOrderDialog (useIsLandscapeTablet). En vertical queda igual que siempre.
  const isPos = useIsLandscapeTablet();
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const { show, toastMessage } = useToast();
  const { fullyPaid } = getPaymentStatus(order);
  const [name, setName] = useState(order.customerName ?? '');
  const [phone, setPhone] = useState(order.customerPhone ?? '');
  const [address, setAddress] = useState(order.customerAddress ?? '');
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState(order.customerNote ?? '');
  const [products, setProducts] = useState<Product[] | null>(null);
  // En POS el catálogo va abierto de una vez (como en Crear pedido) — no hace falta el toque extra de "+ Añadir producto" para verlo.
  const [showAddProduct, setShowAddProduct] = useState(isPos);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<LiveOrderItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [showReciboMenu, setShowReciboMenu] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'full' | 'split' | null>(null);
  const [markingDebt, setMarkingDebt] = useState(false);
  const [togglingDeliveredId, setTogglingDeliveredId] = useState<string | null>(null);
  // "Devolver" (quitar/reducir un ítem ya entregado): pide motivo, queda registrado en Merma.
  const [returnPromptFor, setReturnPromptFor] = useState<LiveOrderItem | null>(null);
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
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cambiar el tipo de pedido.');
    } finally {
      setChangingChannel(false);
    }
  }

  function handleChannelSelect(channel: LiveOrder['channel']) {
    if (channel === order.channel) return;
    if (channel === 'PICKUP' || channel === 'BAR') {
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
        if (data.data?.url || data.data?.sent) {
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
      handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
    } catch (e: any) {
      win?.close();
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda por WhatsApp.');
    } finally {
      setSendingWhatsapp(false);
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

  /** Abre el diálogo de motivo antes de quitar/reducir un ítem ya entregado — para uno que
   * nunca salió, el "−" de siempre sigue siendo directo (sin pedir nada). */
  function requestQtyDecrease(it: LiveOrderItem) {
    if (it.deliveredAt) {
      setReturnPromptFor(it);
      setReturnReason('CUSTOMER_RETURN');
      setReturnQty(1);
      setReturnNote('');
      setReturnError(null);
      return;
    }
    setQty(it.id, it.quantity - 1);
  }

  /** Registra la devolución de 1 unidad con motivo — queda en Merma (WasteReason) como su
   * propia estadística, aparte de las ventas. */
  async function confirmReturn() {
    if (!returnPromptFor) return;
    setReturning(true);
    setReturnError(null);
    try {
      await api.post(`/orders/${order.id}/items/${returnPromptFor.id}/return`, {
        quantity: returnQty,
        reason: returnReason,
        note: returnNote.trim() || undefined,
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

  async function addProductLine(line: CartLine) {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/items`, {
        productId: line.product.id,
        quantity: line.quantity,
        variantId: line.variantId,
        modifierIds: line.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          comboSelections: line.comboSelections,
        note: line.note,
      });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo añadir el producto.');
    } finally {
      setSaving(false);
    }
  }

  /** Reemplaza un ítem ya pedido (ej: cambiar ceviche pequeño por grande + extra camarón):
   * como OrderItem es un snapshot congelado, "editar" = añadir la línea nueva y borrar la vieja.
   * Primero se AÑADE y después se borra, nunca al revés: al revés, si el pedido tenía un solo
   * producto el servidor rechazaba el borrado ("El pedido debe tener al menos un producto") y la
   * edición era imposible; y si fallaba el alta, la línea original ya se había perdido. */
  async function replaceItemWithLine(oldItemId: string, line: CartLine) {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/items`, {
        productId: line.product.id,
        quantity: line.quantity,
        variantId: line.variantId,
        modifierIds: line.selectedModifiers.flatMap((m) => Array(m.quantity ?? 1).fill(m.modifierId)),
          comboSelections: line.comboSelections,
        note: line.note,
      });
      await api.patch(`/orders/${order.id}/items`, { items: [{ orderItemId: oldItemId, quantity: 0 }] });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo actualizar el producto.');
    } finally {
      setSaving(false);
    }
  }

  /** Tocar un ítem ya pedido: si tiene variantes/modificadores, abre el selector precargado
   * con lo que ya tenía (buscado por nombre, ya que el snapshot no guarda el id original). */
  function openItemForEdit(it: LiveOrderItem) {
    const product = products?.find((p) => p.id === it.productId);
    if (!product || !needsPicker(product)) return;
    setEditingItem(it);
    setOptionsProduct(product);
  }

  const categoryNames = [...new Set((products ?? []).map((p) => p.category?.name ?? 'Sin categoría'))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
  const filteredProducts = (products ?? []).filter((p) => {
    const query = productSearch.trim().toLowerCase();
    const matchesCategory = !categoryFilter || (p.category?.name ?? 'Sin categoría') === categoryFilter;
    const matchesSearch = !query || p.name.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  /** Preselección best-effort para editar un ítem: busca por nombre contra el producto actual,
   * ya que el snapshot del pedido no guarda el id original de la variante/modificadores. */
  function initialSelectionFor(it: LiveOrderItem, product: Product) {
    const variant = product.variants?.find((v) => v.name === it.variantName);
    const modifierIds = (product.modifierCategories ?? [])
      .flatMap((c) => c.modifiers)
      .flatMap((m) => {
        const match = it.modifiers.find((im) => im.name === m.name);
        return match ? Array(match.quantity).fill(m.id) : [];
      });
    return { variantId: variant?.id ?? null, modifierIds };
  }

  /** Catálogo para añadir productos: buscador + categorías + grilla. En POS es la columna
   * izquierda completa, siempre visible (como el paso "Menú" de Crear pedido, con foto
   * grande); fuera de POS es el panel que se abre con "+ Añadir producto" — mismos datos,
   * tarjetas más chicas y sin foto para cuadrar en el espacio angosto de siempre. */
  const catalogPanel = (
    <div className={isPos ? 'flex flex-col gap-3 min-h-0' : 'space-y-2 rounded-xl border border-brand-950/10 p-2.5'}>
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-950/30" />
        <input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Buscar en el menú…"
          className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap shrink-0">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            !categoryFilter ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
          }`}
        >
          Todas
        </button>
        {categoryNames.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              categoryFilter === c ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div
        className={
          isPos
            ? 'grid grid-cols-4 gap-3 flex-1 min-h-0 overflow-y-auto'
            : 'grid grid-cols-2 gap-2 max-h-60 overflow-y-auto'
        }
      >
        {filteredProducts.map((p) =>
          isPos ? (
            <div key={p.id} className="rounded-2xl border border-brand-950/10 bg-white overflow-hidden flex flex-col">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="h-24 w-full bg-brand-950/5" />
              )}
              <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                <p className="text-sm font-semibold text-brand-950 truncate">{p.name}</p>
                <p className="text-sm font-bold text-brand-500">{formatBase(p.price, symbol)}</p>
                <div className="flex-1" />
                {needsPicker(p) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setOptionsProduct(p);
                    }}
                    className="w-full rounded-lg border border-brand-500/40 text-brand-500 text-xs font-semibold py-1.5"
                  >
                    Elegir opciones
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => addProductLine({ product: p, quantity: 1, selectedModifiers: [] })}
                    className="w-full flex items-center justify-center gap-1 rounded-lg bg-brand-500 text-white text-xs font-semibold py-1.5 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> Añadir
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key={p.id} className="rounded-xl border border-brand-950/10 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-brand-950/5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-brand-950 truncate">{p.name}</p>
                  <p className="text-xs text-brand-950/50">{formatBase(p.price, symbol)}</p>
                </div>
              </div>
              {needsPicker(p) ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setOptionsProduct(p);
                  }}
                  className="w-full flex items-center justify-center gap-1 rounded-lg border border-brand-500/40 text-brand-500 text-xs font-medium py-1"
                >
                  Elegir opciones
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => addProductLine({ product: p, quantity: 1, selectedModifiers: [] })}
                  className="w-full flex items-center justify-center gap-1 rounded-lg bg-brand-500 text-white text-xs font-medium py-1 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Añadir
                </button>
              )}
            </div>
          ),
        )}
        {filteredProducts.length === 0 && (
          <p className={isPos ? 'col-span-4 text-sm text-brand-950/40 font-light text-center py-6' : 'col-span-2 text-sm text-brand-950/40 font-light text-center py-3'}>
            No hay productos que coincidan.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* En celular sube como una hoja desde abajo (más cómoda para el pulgar que un
          modal centrado); en pantallas sm+ se mantiene el modal centrado de siempre. */}
      <DialogContent
        hideClose
        className={
          isPos
            ? 'max-w-none w-screen h-screen max-h-screen rounded-none border-0 p-5 gap-3 translate-x-0 translate-y-0 left-0 top-0 grid-rows-[auto_minmax(0,1fr)]'
            : 'inset-x-0 left-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-[28px] max-h-[92vh] pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:max-h-[85vh] sm:pb-6 sm:data-[state=open]:animate-scale-in sm:data-[state=closed]:animate-scale-out'
        }
      >
        <PosCol isPos={isPos} className="shrink-0 space-y-2">
        <DialogHeader className="flex-row items-center gap-3 pr-0">
          {/* Celular: chevron atrás, como la hoja del mockup. Escritorio: X de siempre, arriba a la derecha. */}
          <DialogClose className="sm:hidden shrink-0 h-8 w-8 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center focus:outline-none">
            <ChevronLeft className="h-4 w-4 text-brand-950/70" />
            <span className="sr-only">Cerrar</span>
          </DialogClose>
          <DialogTitle className={isPos ? 'flex-1 sm:pr-6 text-xl' : 'flex-1 sm:pr-6'}>
            Editar pedido #{order.orderNumber}
          </DialogTitle>
          <DialogClose
            className={
              isPos
                ? 'hidden sm:flex absolute right-5 top-5 h-11 w-11 items-center justify-center rounded-full text-brand-950/50 hover:text-brand-950 hover:bg-brand-950/5 transition-colors focus:outline-none'
                : 'hidden sm:flex absolute right-4 top-4 rounded-full p-1 text-brand-950/40 hover:text-brand-950 hover:bg-brand-950/5 transition-colors focus:outline-none'
            }
          >
            <X className={isPos ? 'h-6 w-6' : 'h-4 w-4'} />
            <span className="sr-only">Cerrar</span>
          </DialogClose>
        </DialogHeader>

        <div className="space-y-2 pb-2 border-b border-brand-950/10">
          <label className="flex items-center gap-2 text-xs font-medium text-brand-950/60">
            Tipo de pedido
            <select
              value={pendingChannel ?? order.channel}
              onChange={(e) => handleChannelSelect(e.target.value as LiveOrder['channel'])}
              disabled={changingChannel}
              className="border border-brand-950/15 rounded-lg px-2 py-1 text-sm font-medium text-brand-950 disabled:opacity-50"
            >
              <option value="DINE_IN">Mesa</option>
              <option value="DELIVERY">Delivery</option>
              <option value="PICKUP">Pick-up</option>
              <option value="BAR">Barra</option>
            </select>
          </label>

          {pendingChannel === 'DINE_IN' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={channelTableId}
                onChange={(e) => setChannelTableId(e.target.value)}
                className="flex-1 min-w-[10rem] border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
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
        </PosCol>
        <div
          className={
            isPos
              ? 'grid grid-cols-[minmax(0,1.2fr)_380px] gap-5 min-h-0'
              : 'space-y-4 max-h-[70vh] overflow-y-auto'
          }
        >
          {isPos ? (
            <>
              {/* Izquierda: el catálogo completo, siempre abierto — como el paso "Menú" de
                  Crear pedido. Tocar una tarjeta añade el producto (o abre variantes/extras). */}
              <div className="min-h-0 overflow-y-auto pr-1 rounded-2xl border border-brand-950/10 p-4">
                {catalogPanel}
              </div>

              {/* Derecha: cliente + lo ya pedido + montos + acciones + cobro. */}
              <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
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

                <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-brand-950/10 px-4 py-3">
                  <p className="text-base font-bold text-brand-950 shrink-0">Productos</p>
                  <ul className="space-y-1 mt-2 flex-1 min-h-0 overflow-y-auto divide-y divide-brand-950/[0.06]">
                    {order.items.map((it) => {
                      const canEdit = Boolean(products?.find((p) => p.id === it.productId && needsPicker(p)));
                      const delivered = !!it.deliveredAt;
                      return (
                        <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                          <div className={`min-w-0 ${canEdit ? 'cursor-pointer' : ''}`} onClick={() => canEdit && openItemForEdit(it)}>
                            <p className="text-sm font-semibold text-brand-950 truncate">
                              {it.productName}
                              {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                              {canEdit && <span className="text-brand-500 text-xs font-normal"> · editar</span>}
                            </p>
                            {it.modifiers.length > 0 && (
                              <p className="text-xs text-brand-950/50 truncate">{it.modifiers.map(formatModifierLabel).join(', ')}</p>
                            )}
                            <p className="text-xs text-brand-950/50">{it.unitPrice} c/u</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleDelivered(it)}
                              disabled={togglingDeliveredId === it.id}
                              className={`text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                                delivered
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-brand-950/[0.05] text-brand-950/50 border border-transparent hover:bg-brand-950/10'
                              }`}
                            >
                              {delivered ? '✓ Entregado' : 'Entregado'}
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => requestQtyDecrease(it)}
                                disabled={saving}
                                className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm font-bold">{it.quantity}</span>
                              <button
                                onClick={() => setQty(it.id, it.quantity + 1)}
                                disabled={saving}
                                className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 disabled:opacity-30"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="text-sm text-brand-950/70 space-y-1.5 rounded-2xl bg-brand-950/[0.03] px-4 py-3">
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
                  <div className="flex items-center justify-between font-semibold text-brand-950 pt-2 border-t border-brand-950/10">
                    <span className="text-base text-brand-950/60">Total</span>
                    <span className="text-4xl font-bold tabular-nums">{formatBase(order.totalBase, symbol)}</span>
                  </div>
                  <div className="flex justify-between text-brand-950/50">
                    <span>Equivalente en Bs</span>
                    <span className="font-semibold tabular-nums">{formatBsAbsolute(order.totalBs)}</span>
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="pt-2 border-t border-brand-950/10 flex flex-wrap gap-2">
                  <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={printing} onClick={printComanda}>
                    <Printer className="h-3.5 w-3.5" /> {printing ? 'Enviando…' : 'Comanda'}
                  </TextureButton>
                  <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setShowReciboMenu((s) => !s)}>
                    <Receipt className="h-3.5 w-3.5" /> Nota de entrega
                  </TextureButton>
                  {isMesa ? (
                    <TextureButton
                      variant="secondary"
                      size="sm"
                      className="!w-auto"
                      disabled={sendingWhatsapp || !order.customerPhone}
                      title={order.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                      onClick={sendWhatsapp}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsapp ? 'Enviando…' : 'Enviar WhatsApp'}
                    </TextureButton>
                  ) : (
                    <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloading} onClick={downloadJpg}>
                      <Download className="h-3.5 w-3.5" /> {downloading ? 'Generando…' : 'Descargar'}
                    </TextureButton>
                  )}
                  {order.channel === 'DELIVERY' && (
                    <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={dispatching} onClick={handleDeliveryClick}>
                      <Truck className="h-3.5 w-3.5" /> {dispatching ? 'Despachando…' : 'Delivery'}
                    </TextureButton>
                  )}
                </div>

                {showReciboMenu && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={printReceiptFull}
                      disabled={printingReceipt}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                    >
                      <Printer className="h-3.5 w-3.5" /> {printingReceipt ? 'Enviando…' : 'Imprimir'}
                    </button>
                    <button
                      onClick={sendWhatsapp}
                      disabled={sendingWhatsapp || !order.customerPhone}
                      title={order.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
                    </button>
                  </div>
                )}

                {isMesa ? (
                  <p className={`text-sm font-medium text-center ${fullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {fullyPaid ? '✓ Pagado' : 'Pendiente de pago'}
                  </p>
                ) : fullyPaid ? (
                  <p className="text-sm text-emerald-600 font-medium text-center">✓ Pagado</p>
                ) : (
                  // Un solo botón: el propio diálogo de cobro ya deja elegir completo,
                  // fraccionado o deuda (ver PaymentDialog).
                  <TextureButton variant="brand" size="default" onClick={() => setPaymentMode('full')} className="!text-base py-3">
                    <CreditCard className="h-5 w-5" /> Pagar
                  </TextureButton>
                )}
              </div>
            </>
          ) : (
            <>
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
              {order.items.map((it) => {
                const canEdit = Boolean(products?.find((p) => p.id === it.productId && needsPicker(p)));
                const delivered = !!it.deliveredAt;
                return (
                  <li key={it.id} className="space-y-1.5 border-b border-brand-950/10 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`min-w-0 ${canEdit ? 'cursor-pointer' : ''}`}
                        onClick={() => canEdit && openItemForEdit(it)}
                      >
                        <p className="text-sm font-medium text-brand-950 truncate">
                          {it.productName}
                          {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                          {canEdit && <span className="text-brand-500 text-xs font-normal"> · editar</span>}
                        </p>
                        {it.modifiers.length > 0 && (
                          <p className="text-xs text-brand-950/50 truncate">{it.modifiers.map(formatModifierLabel).join(', ')}</p>
                        )}
                        <p className="text-xs text-brand-950/50">{it.unitPrice} c/u</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => requestQtyDecrease(it)}
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
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDelivered(it)}
                      disabled={togglingDeliveredId === it.id}
                      className={`text-xs font-semibold px-2 py-1 rounded-full transition-colors disabled:opacity-50 ${
                        delivered
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-brand-950/[0.05] text-brand-950/50 border border-transparent'
                      }`}
                    >
                      {delivered ? '✓ Entregado' : 'Entregado'}
                    </button>
                  </li>
                );
              })}
            </ul>

            {showAddProduct ? catalogPanel : (
              <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setShowAddProduct(true)}>
                <Plus className="h-3.5 w-3.5" /> Añadir producto
              </TextureButton>
            )}
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

          <div className="pt-2 border-t border-brand-950/10 flex flex-wrap gap-2">
            <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={printing} onClick={printComanda}>
              <Printer className="h-3.5 w-3.5" /> {printing ? 'Enviando…' : 'Comanda'}
            </TextureButton>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto"
              onClick={() => setShowReciboMenu((s) => !s)}
            >
              <Receipt className="h-3.5 w-3.5" /> Nota de entrega
            </TextureButton>
            {isMesa ? (
              <TextureButton
                variant="secondary"
                size="sm"
                className="!w-auto"
                disabled={sendingWhatsapp || !order.customerPhone}
                title={order.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                onClick={sendWhatsapp}
              >
                <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsapp ? 'Enviando…' : 'Enviar WhatsApp'}
              </TextureButton>
            ) : (
              <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloading} onClick={downloadJpg}>
                <Download className="h-3.5 w-3.5" /> {downloading ? 'Generando…' : 'Descargar'}
              </TextureButton>
            )}
            {order.channel === 'DELIVERY' && (
              <TextureButton
                variant="secondary"
                size="sm"
                className="!w-auto"
                disabled={dispatching}
                onClick={handleDeliveryClick}
              >
                <Truck className="h-3.5 w-3.5" /> {dispatching ? 'Despachando…' : 'Delivery'}
              </TextureButton>
            )}
          </div>

          {showReciboMenu && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={printReceiptFull}
                disabled={printingReceipt}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" /> {printingReceipt ? 'Enviando…' : 'Imprimir'}
              </button>
              <button
                onClick={sendWhatsapp}
                disabled={sendingWhatsapp || !order.customerPhone}
                title={order.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
              >
                <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsapp ? 'Enviando…' : 'WhatsApp'}
              </button>
            </div>
          )}

          {isMesa ? (
            <p className={`text-sm font-medium text-center ${fullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
              {fullyPaid ? '✓ Pagado' : 'Pendiente de pago'}
            </p>
          ) : fullyPaid ? (
            <p className="text-sm text-emerald-600 font-medium text-center">✓ Pagado</p>
          ) : (
            <div className={`grid ${canAccountsPayable ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
              <button
                onClick={() => setPaymentMode('full')}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
              >
                <CreditCard className="h-4 w-4 text-brand-500" /> Pagar
              </button>
              <button
                onClick={() => setPaymentMode('split')}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors"
              >
                <SplitSquareHorizontal className="h-4 w-4 text-brand-500" /> Fraccionado
              </button>
              {canAccountsPayable && (
                <button
                  onClick={markDebt}
                  disabled={markingDebt}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-xs font-medium py-2.5 transition-colors disabled:opacity-50"
                >
                  <Clock className="h-4 w-4 text-amber-600" /> Deuda
                </button>
              )}
            </div>
          )}
            </>
          )}
        </div>

        <div className="fixed -left-[9999px] top-0">
          <ComandaReceipt ref={receiptRef} order={order} restaurantName={restaurant?.name ?? ''} />
        </div>
      </DialogContent>

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
                if (editingItem) replaceItemWithLine(editingItem.id, line);
                else addProductLine(line);
                setOptionsProduct(null);
                setEditingItem(null);
              }}
            />
          );
        })()}

      {paymentMode && (
        <PaymentDialog
          order={order}
          mode={paymentMode}
          onClose={() => setPaymentMode(null)}
          onPaid={(fullyPaid) => {
            onSaved();
            if (fullyPaid) autoDispatchAfterPayment();
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

      {returnPromptFor && (
        <Dialog open onOpenChange={(o) => !o && setReturnPromptFor(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Devolver "{returnPromptFor.productName}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-brand-950/60 font-light">
                Ya estaba marcado como entregado — cuéntanos por qué se devuelve. Queda
                registrado en Inventario → Merma, aparte de las ventas.
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
                placeholder="Detalle (opcional)"
                rows={2}
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 resize-none"
              />
              {returnError && <p className="text-sm text-red-600">{returnError}</p>}
              <div className="flex gap-2">
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={returning}
                  onClick={confirmReturn}
                  className="disabled:opacity-50"
                >
                  {returning ? 'Registrando…' : 'Confirmar devolución'}
                </TextureButton>
                <TextureButton variant="secondary" size="default" className="!w-auto" onClick={() => setReturnPromptFor(null)}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Toast message={toastMessage} />
    </Dialog>
  );
}
