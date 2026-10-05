import type { PaymentMethod } from '@/types';
import { settledOf } from '@/utils/orderBalance';


export interface LiveOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  variantName?: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  // Cuánto de esta línea ya se cobró (fraccionar pago por ítems). 0 si nunca se ha usado esa modalidad.
  paidQuantity: number;
  modifiers: { modifierId?: string | null; name: string; priceBase: string; quantity: number }[];
  note?: string | null;
  // Cuándo el mesero lo marcó "Entregado" — condición para pedir motivo al devolverlo
  // (ver returnItem en el backend); null = todavía no salió a la mesa/cliente.
  deliveredAt?: string | null;
  kitchenName?: string | null;
  kitchenStartedAt?: string | null;
  kitchenReadyAt?: string | null;
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
  changeParts?: { method: string; amountBase: string; referenceNumber?: string }[] | null;
  createdAt: string;
}


export interface LiveOrder {
  deliveryCourierId?: string | null;
  deliveryCompletedAt?: string | null;
  deliveryFinalizedAt?: string | null;
  deliveryCancelledAt?: string | null;
  deliveryRouteStartedAt?: string | null;
  adminCorrectedAt?: string | null;
  correctionBalance?: {pendingCollectionBase:string;pendingRefundBase:string} | null;
  id: string;
  orderNumber: number;
  channel: 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
  status: string;
  subtotalBase: string;
  serviceChargeBase: string;
  ivaBase: string;
  deliveryFeeBase: string;
  envaseFeeBase?: string;
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
  paymentMethod?: PaymentMethod | null;
  isEmployeeConsumption?: boolean;
  /** Factura emitida por la máquina fiscal del local. Con valor, ya salió y no se vuelve a
   * emitir: cada emisión consume numeración fiscal (ver FiscalInvoiceDialog). */
  fiscalPrinterInvoice?: string | null;
  fiscalPrinterSerial?: string | null;
  fiscalPrintedAt?: string | null;
  /** Documento que espera el cliente. Intención, no hecho: lo emitido es fiscalPrintedAt. */
  wantsFiscalInvoice?: boolean;
}


/** Estado de pago de un pedido, para colorear la tarjeta y filtrar el Dashboard. */
export function getPaymentStatus(o: LiveOrder) {
  // Un descuento (y el ajuste de servicio) perdona esa parte de la deuda: cuenta como
  // "saldado" igual que el efectivo cobrado — misma cuenta que hace el backend.
  const paidBase = settledOf(o.payments);
  const balanceBase = o.correctionBalance ? Number(o.correctionBalance.pendingCollectionBase) : Math.max(0, Number(o.totalBase) - paidBase);
  const owesBalance = paidBase > 0 && balanceBase > 0.01;
  const fullyPaid = o.payments.length > 0 && balanceBase <= 0.01;
  return { paidBase, balanceBase, owesBalance, fullyPaid };
}


export const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);


/**
 * Navega la pestaña abierta con `window.open('', '_blank')` a `url` (WhatsApp,
 * despacho de repartidor). En móvil, wa.me le entrega el control a la app de
 * WhatsApp de inmediato: la pestaña del navegador nunca llega a mostrar nada
 * y queda pegada en "about:blank" hasta que el usuario la cierra a mano. La
 * cerramos nosotros solos un instante después para que no quede esa pestaña
 * vacía y el foco regrese de una vez al panel. En escritorio la dejamos
 * abierta (ahí sí hace falta, ej. para apretar "Enviar" en WhatsApp Web).
 */
export function openInTabAndAutoClose(win: Window | null, url: string) {
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
export function handleWhatsappSendResult(win: Window | null, data: { sent?: boolean; url?: string; assignedToApp?: boolean }, onSent: () => void) {
  // Si el repartidor tiene usuario Motorizado, el pedido ya apareció en su app y recibió
  // push: no obligamos al cajero a abrir WhatsApp como segundo paso redundante.
  if (data.sent || data.assignedToApp) {
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
