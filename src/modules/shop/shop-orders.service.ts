import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { shopService } from './shop.service';
import { shopInstallmentsService, cuotasQueCaben, diasDeFrecuencia } from './shop-installments.service';

/**
 * Pedidos de la tienda virtual, lado PANEL (requiere JWT del local).
 *
 * El ciclo es corto a propósito: llega PENDING, y el dueño lo acepta o lo cancela. Aceptar es
 * lo que lo convierte en una venta real — recién ahí se descuenta el stock y entra en los
 * reportes. Antes de eso un pedido es solo una intención: si se descontara al llegar, cualquiera
 * podría vaciarle el inventario a un local haciendo pedidos falsos desde el catálogo público.
 */

const ORDER_INCLUDE = { items: true } as const;

type PedidoConItems = {
  total: number;
  financed: boolean;
  installmentsChosen: number | null;
  items: { productId: string | null }[];
};

/**
 * El plan de financiamiento que le toca a un pedido, o null si se cobra completo.
 *
 * Vive acá y no dentro de `confirm` porque el panel necesita EL MISMO número: si el local ve
 * el precio completo y el comprador pagó la inicial, le va a reclamar plata que no debía. La
 * plantilla se lee del EVENTO, nunca de lo que mandó el cliente.
 */
async function planDelPedido(restaurantId: string, order: PedidoConItems) {
  if (!order.financed) return null;
  const evento = await prisma.shopProduct.findFirst({
    where: {
      id: { in: order.items.map((i) => i.productId).filter((v): v is string => !!v) },
      restaurantId,
      isEvent: true,
      eventFinancingEnabled: true,
    },
    select: { eventDownPercent: true, eventInstallments: true, eventFrequency: true, eventFinancingDeadline: true },
  });
  // Si el evento ya no permite financiar (lo apagaron mientras el cliente compraba), se cobra
  // completo: es más seguro que inventarle un plan que el local ya no ofrece.
  if (!evento?.eventInstallments) return null;
  // El límite de fecha manda: pasado, se cobra completo (misma política que cuando apagan el
  // financiamiento con la compra en curso), y antes de él solo caben las cuotas que llegan a
  // pagarse a tiempo con esa frecuencia.
  let techo = evento.eventInstallments;
  if (evento.eventFinancingDeadline) {
    techo = Math.min(techo, cuotasQueCaben(evento.eventFinancingDeadline, evento.eventFrequency ?? 'MENSUAL'));
    if (techo < 2) return null;
  }
  // El comprador elige en cuántas cuotas, el evento pone el techo: elegir de más no alarga el
  // plazo que el local está dispuesto a esperar, y menos de 2 no es financiar.
  const cuotas = Math.min(Math.max(order.installmentsChosen ?? techo, 2), techo);
  const inicial = Math.round(order.total * ((evento.eventDownPercent ?? 0) / 100) * 100) / 100;
  const porCuota = Math.round(((order.total - inicial) / cuotas) * 100) / 100;
  return { inicial, cuotas, porCuota, frecuencia: evento.eventFrequency ?? 'MENSUAL' };
}

async function list(restaurantId: string, opts: { status?: string; limit?: number } = {}) {
  const pedidos = await prisma.shopOrder.findMany({
    where: { restaurantId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
    include: ORDER_INCLUDE,
  });
  // El plan viaja resuelto al panel para que el local cobre la inicial y no el total.
  return Promise.all(
    pedidos.map(async (p) => ({ ...p, plan: p.financed ? await planDelPedido(restaurantId, p) : null })),
  );
}

/**
 * Acepta el pedido: crea la venta (que descuenta stock e insumos, ver shopService.recordSale) y
 * deja el pedido apuntando a ella.
 *
 * El pedido guarda sus propios precios congelados desde que entró, así que la venta se arma con
 * esos y no con el catálogo de hoy: el cliente paga lo que le mostramos, aunque mientras tanto
 * le hayan cambiado el precio al producto.
 */
async function confirm(restaurantId: string, userId: string, orderId: string, paymentMethod?: string | null) {
  const order = await prisma.shopOrder.findFirst({
    where: { id: orderId, restaurantId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound('Pedido no encontrado.');
  if (order.status === 'CONFIRMED') throw badRequest('Este pedido ya fue confirmado.');
  if (order.status === 'CANCELLED') throw badRequest('Este pedido fue cancelado.');

  // Financiado: la venta se arma a crédito y la inicial es lo único cobrado hoy. Es el mismo
  // cálculo que el panel ya le mostró al local, para que no haya dos números en juego.
  const plan = await planDelPedido(restaurantId, order);

  const sale = await shopService.recordSale(restaurantId, userId, {
    // El envío va dentro del total de la venta: es plata que entra al local, aunque no sea una
    // línea de producto. Por eso el total de la venta puede no coincidir con la suma de sus
    // líneas — igual que pasaría con cualquier cargo que no sea mercancía.
    total: order.total,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerIdNumber: order.customerIdNumber,
    // Deja el pedido marcado en las entradas que se emitan: confirmar es el momento en que el
    // local da el pago por bueno, y es cuando el asistente recibe su boleto.
    shopOrderId: order.id,
    ...(plan ? { creditTerms: 'INSTALLMENT' as const, amountPaidNow: plan.inicial } : {}),
    // El pedido web puede llegar sin método elegido: en ese caso la venta queda con el
    // método que el cajero escoja al confirmar, y si tampoco viene, "Efectivo Bs" (lo que
    // realmente pasa: el cliente paga al recibir en efectivo).
    paymentMethod: paymentMethod ?? order.paymentMethod ?? 'Efectivo Bs',
    items: order.items.map((it) => ({
      // El DTO de la venta usa `undefined` para "sin producto"; la fila lo guarda como null.
      productId: it.productId ?? undefined,
      v1: it.v1,
      v2: it.v2,
      name: it.name,
      category: it.category,
      qty: it.qty,
      price: it.price,
      cost: it.cost,
      soldByWeight: it.soldByWeight,
    })),
  });

  // El calendario se crea DESPUÉS de la venta, que es contra lo que se cuelga. Si el evento
  // no traía frecuencia se usa mensual, la misma opción por defecto del formulario.
  if (plan) {
    // La primera cuota vence a una FRECUENCIA de hoy, no a 30 días fijos: con cuotas
    // quincenales y tope de fecha, arrancar a los 30 días corría el plan fuera del límite
    // que el cálculo de arriba acaba de respetar.
    const hoy = new Date();
    const primera = new Date(hoy.getTime() + diasDeFrecuencia(plan.frecuencia) * 86400000)
      .toISOString()
      .slice(0, 10);
    await shopInstallmentsService
      .crearPlan(restaurantId, sale.id, { cantidad: plan.cuotas, primeraFecha: primera, frecuencia: plan.frecuencia })
      .catch(() => undefined);
  }

  const actualizado = await prisma.shopOrder.update({
    where: { id: order.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      shopSaleId: sale.id,
      ...(paymentMethod ? { paymentMethod } : {}),
    },
    include: ORDER_INCLUDE,
  });

  // Aviso transaccional por el WhatsApp vinculado del local (Evolution): confirmar ES el
  // momento en que el pago quedó bueno, que es lo que el comprador está esperando saber.
  // Si el pedido traía entradas, se le dice dónde viven (su Wallet). En segundo plano y
  // tragándose cualquier error: confirmar un pedido jamás depende de WhatsApp.
  (async () => {
    const negocio = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
    if (!negocio) return;
    const entradas = sale.tickets?.length ?? 0;
    const lineaEntradas = entradas > 0
      ? `

🎟️ ${entradas === 1 ? 'Tu entrada ya está' : `Tus ${entradas} entradas ya están`} en tu QuickTap Wallet: quicktap.club/wallet`
      : plan
        ? `

📅 Tu plan de cuotas quedó activo — síguelo en quicktap.club/wallet`
        : '';
    const { whatsappLinkService, frase } = await import('../whatsapp-link/whatsapp-link.service');
    await whatsappLinkService.enviar(
      restaurantId,
      order.customerPhone,
      frase(
        `✅ *${negocio.name}*

${order.customerName}, confirmamos tu pedido #${order.orderNumber}.${lineaEntradas}`,
        `✅ *${negocio.name}*

¡Gracias por tu compra, ${order.customerName}! Tu pedido #${order.orderNumber} quedó confirmado.${lineaEntradas}`,
        `✅ *${negocio.name}*

${order.customerName}, tu pago quedó verificado y el pedido #${order.orderNumber} confirmado.${lineaEntradas}`,
      ),
    );
  })().catch(() => undefined);

  // Entradas que la venta emitió, si el pedido llevaba algún evento — es lo que el panel usa
  // para ofrecer la imagen descargable justo al confirmar (ver ShopOrdersPage).
  return { ...actualizado, tickets: sale.tickets };
}

/** Cancela un pedido que todavía no se confirmó. Uno ya confirmado se deshace devolviendo su
 * venta desde el historial (shopService.returnSale), que es lo que repone el stock. */
async function cancel(restaurantId: string, orderId: string) {
  const order = await prisma.shopOrder.findFirst({ where: { id: orderId, restaurantId }, select: { id: true, status: true } });
  if (!order) throw notFound('Pedido no encontrado.');
  if (order.status === 'CONFIRMED') {
    throw badRequest('Este pedido ya se convirtió en venta. Devuelve la venta desde el historial para reponer el stock.');
  }
  if (order.status === 'CANCELLED') throw badRequest('Este pedido ya estaba cancelado.');

  return prisma.shopOrder.update({
    where: { id: order.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
    include: ORDER_INCLUDE,
  });
}

export const shopOrdersService = { list, confirm, cancel, planDelPedido };
