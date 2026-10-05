import type { LiveOrder } from '@/components/admin/LiveOrdersPanel.shared';

export const ORDER_WHATSAPP_ACTIONS = [
  ['summary', 'Enviar resumen de pedido'],
  ['accepted', 'Pedido aceptado'],
  ['cancelled', 'Pedido cancelado'],
  ['ready', 'Pedido listo'],
  ['on_way', 'Pedido en camino'],
  ['arrived', 'Pedido ha llegado'],
  ['delivered', 'Pedido entregado'],
  ['confirm', 'Pedir confirmación'],
] as const;
export type OrderWhatsappAction = typeof ORDER_WHATSAPP_ACTIONS[number][0];

/** Los números locales se interpretan como venezolanos; +/00 conserva otro país. */
export function orderWhatsappPhone(raw: string | null): string | null {
  const value = (raw ?? '').trim();
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('00')) digits = digits.slice(2);
  else if (!value.startsWith('+')) {
    if (/^0[24]\d{9}$/.test(digits)) digits = `58${digits.slice(1)}`;
    else if (/^[24]\d{9}$/.test(digits)) digits = `58${digits}`;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** Solo información del pedido guardado, nunca del carrito ni notas administrativas. */
export function orderWhatsappMessage(order: LiveOrder, action: OrderWhatsappAction, business: string): string {
  const greeting = `Hola${order.customerName ? `, ${order.customerName}` : ''}. Te escribimos de ${business || 'tu restaurante'} sobre tu pedido #${order.orderNumber}.`;
  const status: Record<Exclude<OrderWhatsappAction, 'summary'>, string> = {
    accepted: 'Tu pedido fue aceptado. ¡Gracias por elegirnos!',
    cancelled: 'Tu pedido fue cancelado. Escríbenos si necesitas más información.',
    ready: order.channel === 'PICKUP' ? 'Tu pedido está listo para retirar en el local.' : 'Tu pedido está listo.',
    on_way: 'Tu pedido va en camino a la dirección de entrega.',
    arrived: 'Tu pedido ha llegado a la dirección de entrega. Por favor, acércate a recibirlo.',
    delivered: 'Tu pedido fue entregado. ¡Gracias por tu compra!',
    confirm: '¿Nos confirmas que los datos y productos de tu pedido son correctos? Responde a este mensaje para confirmar o indicar algún cambio.',
  };
  if (action !== 'summary' && action !== 'confirm') return `${greeting}\n\n${status[action]}`;
  const money = (value: string | number) => `${order.currency} ${Number(value).toFixed(2)}`;
  const channels = { DINE_IN: 'Mesa', BAR: 'Barra', EXPRESS: 'Express', DELIVERY: 'Delivery', PICKUP: 'Pick-up' };
  const lines = [greeting, '', '*Resumen de tu pedido*', `${channels[order.channel]}${order.table ? ` · ${order.table.number}` : ''}`];
  for (const item of order.items.filter(item => item.quantity > 0)) {
    lines.push(`${item.quantity} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ''} — ${money(item.lineTotal)}`);
    for (const extra of item.modifiers) lines.push(`  + ${extra.quantity} × ${extra.name}`);
    if (item.note) lines.push(`  Nota: ${item.note}`);
  }
  lines.push('', `Subtotal: ${money(order.subtotalBase)}`);
  if (Number(order.serviceChargeBase)) lines.push(`Servicio: ${money(order.serviceChargeBase)}`);
  if (Number(order.ivaBase)) lines.push(`IVA: ${money(order.ivaBase)}`);
  if (Number(order.deliveryFeeBase)) lines.push(`Envío: ${money(order.deliveryFeeBase)}`);
  if (Number(order.envaseFeeBase)) lines.push(`Envases: ${money(order.envaseFeeBase!)}`);
  lines.push(`*Total del pedido: ${money(order.totalBase)}*`);
  // Snapshot del pedido: no recalcular con la tasa actual del restaurante.
  const totalBs = Number(order.totalBs);
  if (order.totalBs != null && Number.isFinite(totalBs)) {
    lines.push(`*Equivalente en Bs: ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  }
  if (order.channel === 'DELIVERY' && order.customerAddress) lines.push(`Dirección: ${order.customerAddress}`);
  if (action === 'confirm') lines.push('', status.confirm);
  return lines.join('\n');
}
export type OrderWhatsappLinkStatus = {
  disponible: boolean;
  vinculado?: boolean;
  status?: string;
  phone?: string | null;
  paused?: boolean;
  planPermitido?: boolean;
};

/** Una conexión caída conserva su número: nunca se convierte en envío externo. */
export function orderWhatsappDeliveryMode(link: OrderWhatsappLinkStatus): 'direct' | 'external' | 'unavailable' {
  if (link.status === 'NONE' || (link.status === 'DISCONNECTED' && !link.phone)) return 'external';
  if (link.disponible && link.vinculado && !link.paused && link.planPermitido !== false) return 'direct';
  return 'unavailable';
}
