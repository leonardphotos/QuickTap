import { baseToBs, formatBs, formatMoney, round2, toDecimal } from './money';

/**
 * ============================================================================
 *  Módulo de checkout WhatsApp (Canal Delivery / Pickup)
 * ============================================================================
 *  Toma el carrito + los datos del cliente y arma un enlace `https://wa.me/`
 *  con el mensaje del pedido perfectamente estructurado y estético.
 *
 *  El mensaje se codifica con `encodeURIComponent` para respetar saltos de
 *  línea, emojis y caracteres especiales. Los montos se muestran en Bs
 *  (moneda de pago del cliente) con el precio en la moneda base del
 *  restaurante ($/€) como referencia entre paréntesis.
 */

export type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD' | 'BINANCE' | 'PAYPAL' | 'TRANSFER';

export type DeliveryMode = 'DELIVERY' | 'PICKUP';

export interface WhatsappCartItem {
  name: string;
  quantity: number;
  /** Precio unitario en la moneda base del restaurante ($ o €). */
  unitPrice: number | string;
  /** Modificadores del plato: "Sin cebolla", "Extra queso"... */
  modifiers?: string[];
  /** Nota de cocina para este ítem. */
  note?: string;
}

export interface WhatsappCustomer {
  name: string;
  phone?: string;
  address?: string;
  /** Enlace de Google Maps con la ubicación GPS del cliente. */
  locationUrl?: string;
  paymentMethod: PaymentMethod;
  /** Nota general del pedido. */
  note?: string;
}

export interface BuildWhatsappCheckoutParams {
  restaurantName: string;
  /** WhatsApp destino en formato internacional sin "+" (ej: 584141234567). */
  whatsappPhone: string;
  /** Símbolo de la moneda base del restaurante ($ o €). */
  currencySymbol: string;
  /** Tasa BCV vigente (moneda base -> Bs). */
  exchangeRate: number | string;
  mode: DeliveryMode;
  items: WhatsappCartItem[];
  customer: WhatsappCustomer;
  /** Cargos opcionales ya calculados por el restaurante (0 si están apagados). */
  serviceChargeBase?: number | string;
  ivaBase?: number | string;
  /** Costo de envío calculado (por distancia o zona). 0 si no aplica. */
  deliveryFeeBase?: number | string;
}

export interface WhatsappCheckoutResult {
  url: string;
  message: string;
  subtotalBase: string;
  totalBs: string;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

/**
 * Formatea un número de teléfono venezolano al formato internacional que
 * exige WhatsApp: "+58" seguido del número sin el 0 inicial (ej.
 * "0424-1234567" -> "+584241234567"). Si el número ya trae el 58 (con o sin
 * "+"), lo deja igual en vez de duplicar el código de país.
 */
export function formatVenezuelanWhatsappPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('58')) return `+${digits}`;
  return `+58${digits.replace(/^0+/, '')}`;
}

/**
 * Normaliza el número de teléfono a solo dígitos (wa.me no acepta "+" ni
 * espacios). No asume ningún país: el registro de restaurantes ya guarda
 * `whatsappPhone` con el código de marcación correcto según el país elegido
 * (ver `formatVenezuelanWhatsappPhone` para el caso específico de números
 * venezolanos sueltos, ej. el teléfono que escribe un comensal).
 */
function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Enlace `wa.me` genérico con texto libre (ej. mensajes del Dashboard maestro al restaurante). */
export function buildWhatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${sanitizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * Construye el enlace de WhatsApp para un pedido de delivery/pickup.
 * Función pura: no toca la base de datos, fácil de testear.
 */
export function buildWhatsappCheckoutUrl(
  params: BuildWhatsappCheckoutParams,
): WhatsappCheckoutResult {
  const {
    restaurantName,
    whatsappPhone,
    currencySymbol,
    exchangeRate,
    mode,
    items,
    customer,
    serviceChargeBase = 0,
    ivaBase = 0,
    deliveryFeeBase = 0,
  } = params;

  if (items.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  // --- Cálculo de totales ---
  let subtotalBase = toDecimal(0);
  const lines: string[] = [];

  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.quantity));
    const lineTotalBase = round2(toDecimal(item.unitPrice).mul(qty));
    const lineTotalBs = baseToBs(lineTotalBase, exchangeRate);
    subtotalBase = subtotalBase.add(lineTotalBase);

    // Línea principal en Bs (moneda de pago), con la base entre paréntesis.
    lines.push(
      `• ${qty}x ${item.name}  —  ${formatBs(lineTotalBs)} (${formatMoney(lineTotalBase, currencySymbol)})`,
    );

    // Modificadores
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        lines.push(`     ↳ ${mod}`);
      }
    }
    // Nota de cocina del ítem
    if (item.note) {
      lines.push(`     📝 ${item.note}`);
    }
  }

  subtotalBase = round2(subtotalBase);
  const serviceChargeBaseDec = round2(serviceChargeBase);
  const ivaBaseDec = round2(ivaBase);
  const deliveryFeeBaseDec = round2(deliveryFeeBase);
  const hasCharges = serviceChargeBaseDec.gt(0) || ivaBaseDec.gt(0) || deliveryFeeBaseDec.gt(0);
  const totalBase = round2(subtotalBase.add(serviceChargeBaseDec).add(ivaBaseDec).add(deliveryFeeBaseDec));
  const totalBs = baseToBs(totalBase, exchangeRate);

  // --- Armado del mensaje ---
  const nl = '\n';
  const parts: string[] = [];

  parts.push(`*🧾 NUEVO PEDIDO — ${restaurantName}*`);
  parts.push(mode === 'DELIVERY' ? '🛵 Modalidad: *Delivery*' : '🏬 Modalidad: *Pickup / Retiro*');
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('*Detalle del pedido:*');
  parts.push(...lines);
  if (hasCharges) {
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push(`Subtotal: ${formatBs(baseToBs(subtotalBase, exchangeRate))} (${formatMoney(subtotalBase, currencySymbol)})`);
    if (serviceChargeBaseDec.gt(0)) {
      parts.push(
        `Servicio (10%): ${formatBs(baseToBs(serviceChargeBaseDec, exchangeRate))} (${formatMoney(serviceChargeBaseDec, currencySymbol)})`,
      );
    }
    if (ivaBaseDec.gt(0)) {
      parts.push(`IVA (16%): ${formatBs(baseToBs(ivaBaseDec, exchangeRate))} (${formatMoney(ivaBaseDec, currencySymbol)})`);
    }
    if (deliveryFeeBaseDec.gt(0)) {
      parts.push(
        `🛵 Envío: ${formatBs(baseToBs(deliveryFeeBaseDec, exchangeRate))} (${formatMoney(deliveryFeeBaseDec, currencySymbol)})`,
      );
    }
  }
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push(`*Total a pagar:*  ${formatBs(totalBs)}`);
  parts.push(`_Equivalente: ${formatMoney(totalBase, currencySymbol)}_`);
  parts.push(`_Tasa BCV aplicada: ${formatBs(exchangeRate)} / ${currencySymbol}1_`);
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('*Datos del cliente:*');
  parts.push(`👤 ${customer.name}`);
  if (customer.phone) parts.push(`📞 ${customer.phone}`);
  if (mode === 'DELIVERY' && customer.address) parts.push(`📍 ${customer.address}`);
  if (mode === 'DELIVERY' && customer.locationUrl) parts.push(`🗺️ Ubicación: ${customer.locationUrl}`);
  parts.push(`💳 Pago: ${PAYMENT_LABELS[customer.paymentMethod]}`);
  if (customer.note) parts.push(`🗒️ Nota: ${customer.note}`);
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('_Enviado desde QuickTap.club_');

  const message = parts.join(nl);

  const url = `https://wa.me/${sanitizePhone(whatsappPhone)}?text=${encodeURIComponent(message)}`;

  return {
    url,
    message,
    subtotalBase: subtotalBase.toFixed(2),
    totalBs: totalBs.toFixed(2),
  };
}

/**
 * ============================================================================
 *  Plantilla del mensaje de "Enviar vía WhatsApp" (comanda al cliente)
 * ============================================================================
 *  Cada restaurante puede personalizar el texto desde Configuración
 *  (`Restaurant.whatsappOrderMessageTemplate`). Los datos del pedido en sí
 *  (ítems y totales) NO son editables — se calculan siempre desde la base de
 *  datos y se insertan como bloques ya formateados, para que el restaurante
 *  pueda cambiar el tono/branding del mensaje sin arriesgar que el total o
 *  los precios queden mal escritos.
 */
export const DEFAULT_COMANDA_WHATSAPP_TEMPLATE = [
  '{{header}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '*Detalle:*',
  '{{items}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '{{totales}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '_Enviado desde QuickTap.club_',
].join('\n');

/** Reemplaza placeholders `{{clave}}` en una plantilla con los valores dados. */
export function renderWhatsappTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}
