import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { baseToBs, CURRENCY_SYMBOLS, round2, toDecimal } from '../../utils/money';
import { buildWhatsappCheckoutUrl } from '../../utils/whatsapp';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CartItemInput, DeliveryCheckoutInput, DineInCheckoutInput } from './order.dto';

/**
 * ============================================================================
 *  Servicio de comandas — resuelve los dos canales de venta.
 * ============================================================================
 */

interface PricedLine {
  productId: string;
  productName: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  modifiers: string[];
  note?: string;
}

/**
 * Toma los ítems del carrito, valida que los productos existan / estén
 * disponibles y pertenezcan al tenant, y CONGELA los precios desde la BD
 * (nunca se confía en el precio que envía el cliente).
 */
async function priceCart(restaurantId: string, items: CartItemInput[]): Promise<PricedLine[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw badRequest(`El producto ${item.productId} no existe en este restaurante.`);
    }
    if (!product.isAvailable) {
      throw badRequest(`"${product.name}" no está disponible en este momento.`);
    }

    const unitPrice = product.price;
    const lineTotal = round2(unitPrice.mul(item.quantity));

    return {
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      modifiers: item.modifiers ?? [],
      note: item.note,
    };
  });
}

function sumSubtotal(lines: PricedLine[]): Prisma.Decimal {
  return round2(lines.reduce((acc, l) => acc.add(l.lineTotal), toDecimal(0)));
}

/**
 * Genera el correlativo por inquilino de forma segura ante concurrencia,
 * dentro de una transacción.
 */
async function nextOrderNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<number> {
  const last = await tx.order.findFirst({
    where: { restaurantId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

export const orderService = {
  /**
   * -------------------------------------------------------------------------
   *  CANAL EN MESA (DINE_IN)
   *  Persiste la comanda y emite el evento de WebSocket para dejarla
   *  "lista para imprimir" en la cola de la cocina.
   * -------------------------------------------------------------------------
   */
  async checkoutDineIn(input: DineInCheckoutInput) {
    // La mesa (y por tanto el tenant) se resuelve desde el token del QR.
    const table = await prisma.table.findUnique({
      where: { qrToken: input.qrToken },
      include: { restaurant: { select: { id: true, baseCurrency: true, isActive: true } } },
    });
    if (!table || !table.isActive || !table.restaurant.isActive) {
      throw notFound('Mesa no válida.');
    }

    const restaurantId = table.restaurantId;
    const currency = table.restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const totalBase = subtotalBase; // sin cargos extra por ahora
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      // Mientras la mesa esté "abierta", todos sus pedidos se acumulan en la
      // misma cuenta (TableSession). Solo el primer pedido pide nombre/cédula.
      let session = await tx.tableSession.findFirst({ where: { tableId: table.id, status: 'OPEN' } });

      if (!session) {
        if (!input.customerName || !input.customerIdNumber) {
          throw badRequest('Faltan tus datos de facturación (nombre y cédula).');
        }
        session = await tx.tableSession.create({
          data: {
            restaurantId,
            tableId: table.id,
            customerName: input.customerName,
            customerIdNumber: input.customerIdNumber,
          },
        });
      }

      const orderNumber = await nextOrderNumber(tx, restaurantId);
      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          channel: 'DINE_IN',
          status: 'KITCHEN', // entra directo a la cola de cocina
          tableId: table.id,
          tableSessionId: session.id,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          currency,
          subtotalBase,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
              modifiers: l.modifiers,
              note: l.note,
            })),
          },
        },
        include: { items: true, table: { select: { number: true } } },
      });
    });

    // Empuja la comanda a la cocina en tiempo real (lista para imprimir).
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      tableId: order.tableId,
      table: order.table?.number,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        modifiers: i.modifiers,
        note: i.note,
      })),
      totalBase: order.totalBase,
      currency: order.currency,
      totalBs: order.totalBs,
      createdAt: order.createdAt,
    });

    return order;
  },

  /**
   * -------------------------------------------------------------------------
   *  CANAL DELIVERY / PICKUP (WhatsApp)
   *  Persiste la comanda y devuelve el enlace `wa.me` con el pedido
   *  formateado listo para enviar al WhatsApp del restaurante.
   * -------------------------------------------------------------------------
   */
  async checkoutDelivery(restaurantSlug: string, input: DeliveryCheckoutInput) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        whatsappPhone: true,
        isActive: true,
      },
    });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');
    if (!restaurant.whatsappPhone) {
      throw badRequest('El restaurante no tiene un número de WhatsApp configurado.');
    }

    const restaurantId = restaurant.id;
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency);
    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const totalBase = subtotalBase;
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, restaurantId);
      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          channel: input.mode, // DELIVERY | PICKUP
          status: 'PENDING',
          currency: restaurant.baseCurrency,
          subtotalBase,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerAddress: input.customer.address,
          paymentMethod: input.customer.paymentMethod,
          customerNote: input.customer.note,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
              modifiers: l.modifiers,
              note: l.note,
            })),
          },
        },
        include: { items: true },
      });
    });

    // Construye el enlace de WhatsApp con el pedido ya congelado.
    const whatsapp = buildWhatsappCheckoutUrl({
      restaurantName: restaurant.name,
      whatsappPhone: restaurant.whatsappPhone,
      currencySymbol: CURRENCY_SYMBOLS[restaurant.baseCurrency],
      exchangeRate: rate.rateBs.toString(),
      mode: input.mode,
      items: lines.map((l) => ({
        name: l.productName,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toString(),
        modifiers: l.modifiers,
        note: l.note,
      })),
      customer: input.customer,
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotalBase: order.subtotalBase,
      totalBs: order.totalBs,
      whatsappUrl: whatsapp.url,
    };
  },

  /** Cola de comandas de la cocina (panel del restaurante). */
  async listKitchenQueue(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'KITCHEN'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: true, table: { select: { number: true } } },
    });
  },

  /** Cambia el estado de una comanda y notifica a la cocina. */
  async updateStatus(restaurantId: string, orderId: string, status: 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED') {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');

    const order = await prisma.order.update({ where: { id: orderId }, data: { status } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, {
      orderId: order.id,
      status: order.status,
    });

    // Avisa al cliente que escaneó el QR de la mesa que su pedido está listo.
    if (order.status === 'SERVED' && order.channel === 'DINE_IN' && order.tableId) {
      emitToTable(order.tableId, SocketEvents.ORDER_READY, {
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    }

    return order;
  },
};
