import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { shopService } from './shop.service';

/**
 * Pedidos de la tienda virtual, lado PANEL (requiere JWT del local).
 *
 * El ciclo es corto a propósito: llega PENDING, y el dueño lo acepta o lo cancela. Aceptar es
 * lo que lo convierte en una venta real — recién ahí se descuenta el stock y entra en los
 * reportes. Antes de eso un pedido es solo una intención: si se descontara al llegar, cualquiera
 * podría vaciarle el inventario a un local haciendo pedidos falsos desde el catálogo público.
 */

const ORDER_INCLUDE = { items: true } as const;

async function list(restaurantId: string, opts: { status?: string; limit?: number } = {}) {
  return prisma.shopOrder.findMany({
    where: { restaurantId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
    include: ORDER_INCLUDE,
  });
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

  const sale = await shopService.recordSale(restaurantId, userId, {
    // El envío va dentro del total de la venta: es plata que entra al local, aunque no sea una
    // línea de producto. Por eso el total de la venta puede no coincidir con la suma de sus
    // líneas — igual que pasaría con cualquier cargo que no sea mercancía.
    total: order.total,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
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

  return prisma.shopOrder.update({
    where: { id: order.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      shopSaleId: sale.id,
      ...(paymentMethod ? { paymentMethod } : {}),
    },
    include: ORDER_INCLUDE,
  });
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

export const shopOrdersService = { list, confirm, cancel };
