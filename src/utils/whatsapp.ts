import { formatBs, formatMoney, round2, toDecimal, usdToBs } from './money';

/**
 * ============================================================================
 *  Módulo de checkout WhatsApp (Canal Delivery / Pickup)
 * ============================================================================
 *  Toma el carrito + los datos del cliente y arma un enlace `https://wa.me/`
 *  con el mensaje del pedido perfectamente estructurado y estético.
 *
 *  El mensaje se codifica con `encodeURIComponent` para respetar saltos de
 *  línea, emojis y caracteres especiales.
 */

export type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';

export type DeliveryMode = 'DELIVERY' | 'PICKUP';

export interface WhatsappCartItem {
  name: string;
  quantity: number;
  /** Precio unitario en USD. */
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
  paymentMethod: PaymentMethod;
  /** Nota general del pedido. */
  note?: string;
}

export interface BuildWhatsappCheckoutParams {
  restaurantName: string;
  /** WhatsApp destino en formato internacional sin "+" (ej: 584141234567). */
  whatsappPhone: string;
  /** Tasa de cambio USD -> Bs vigente. */
  exchangeRate: number | string;
  mode: DeliveryMode;
  items: WhatsappCartItem[];
  customer: WhatsappCustomer;
}

export interface WhatsappCheckoutResult {
  url: string;
  message: string;
  subtotalUsd: string;
  totalBs: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta / Punto de venta',
};

/** Normaliza el número de teléfono a solo dígitos (wa.me no acepta "+" ni espacios). */
function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Construye el enlace de WhatsApp para un pedido de delivery/pickup.
 * Función pura: no toca la base de datos, fácil de testear.
 */
export function buildWhatsappCheckoutUrl(
  params: BuildWhatsappCheckoutParams,
): WhatsappCheckoutResult {
  const { restaurantName, whatsappPhone, exchangeRate, mode, items, customer } = params;

  if (items.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  // --- Cálculo de totales ---
  let subtotal = toDecimal(0);
  const lines: string[] = [];

  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.quantity));
    const lineTotal = round2(toDecimal(item.unitPrice).mul(qty));
    subtotal = subtotal.add(lineTotal);

    // Línea principal: "2x Hamburguesa Clásica ....... $17.00"
    lines.push(`• ${qty}x ${item.name}  —  ${formatMoney(lineTotal)}`);

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

  const subtotalUsd = round2(subtotal);
  const totalBs = usdToBs(subtotalUsd, exchangeRate);

  // --- Armado del mensaje ---
  const nl = '\n';
  const parts: string[] = [];

  parts.push(`*🧾 NUEVO PEDIDO — ${restaurantName}*`);
  parts.push(mode === 'DELIVERY' ? '🛵 Modalidad: *Delivery*' : '🏬 Modalidad: *Pickup / Retiro*');
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('*Detalle del pedido:*');
  parts.push(...lines);
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push(`*Subtotal:*  ${formatMoney(subtotalUsd)}`);
  parts.push(`*Total en Bs:*  ${formatBs(totalBs)}`);
  parts.push(`_Tasa aplicada: ${formatBs(exchangeRate)} / $_`);
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('*Datos del cliente:*');
  parts.push(`👤 ${customer.name}`);
  if (customer.phone) parts.push(`📞 ${customer.phone}`);
  if (mode === 'DELIVERY' && customer.address) parts.push(`📍 ${customer.address}`);
  parts.push(`💳 Pago: ${PAYMENT_LABELS[customer.paymentMethod]}`);
  if (customer.note) parts.push(`🗒️ Nota: ${customer.note}`);
  parts.push('━━━━━━━━━━━━━━━━━━━━');
  parts.push('_Enviado desde QuickTap.club_');

  const message = parts.join(nl);

  const url = `https://wa.me/${sanitizePhone(whatsappPhone)}?text=${encodeURIComponent(message)}`;

  return {
    url,
    message,
    subtotalUsd: subtotalUsd.toFixed(2),
    totalBs: totalBs.toFixed(2),
  };
}
