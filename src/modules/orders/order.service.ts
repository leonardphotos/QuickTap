import { OrderChannel, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { baseToBs, CURRENCY_SYMBOLS, round2, toDecimal } from '../../utils/money';
import { buildWhatsappCheckoutUrl, buildWhatsappUrl } from '../../utils/whatsapp';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { startOfTodayCaracas } from '../../utils/timezone';
import { haversineDistanceKm, isPointInPolygon, LatLng } from '../../utils/geo';
import { tableSessionService } from '../table-sessions/table-session.service';
import {
  CartItemInput,
  DeliveryCheckoutInput,
  DineInCheckoutInput,
  ManualOrderInput,
  OrderHistoryQuery,
  UpdateOrderItemsInput,
} from './order.dto';

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

// Cargos opcionales del checkout: el restaurante los activa/desactiva desde
// Ajustes, pero el porcentaje en sí no es configurable.
const SERVICE_CHARGE_RATE = 0.1;
const IVA_RATE = 0.16;

function calculateCharges(
  subtotalBase: Prisma.Decimal,
  restaurant: { serviceChargeEnabled: boolean; ivaEnabled: boolean },
) {
  const serviceChargeBase = restaurant.serviceChargeEnabled ? round2(subtotalBase.mul(SERVICE_CHARGE_RATE)) : toDecimal(0);
  const ivaBase = restaurant.ivaEnabled ? round2(subtotalBase.mul(IVA_RATE)) : toDecimal(0);
  const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase));
  return { serviceChargeBase, ivaBase, totalBase };
}

/**
 * Calcula el costo de envío según el modo configurado por el restaurante.
 * Sin ubicación del cliente, sin origen configurado, o sin zona que la
 * contenga, el envío queda en 0 (no bloquea el checkout).
 */
async function computeDeliveryFee(
  restaurant: {
    id: string;
    deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
    deliveryOriginLat: number | null;
    deliveryOriginLng: number | null;
    deliveryBaseFee: Prisma.Decimal;
    deliveryPricePerKm: Prisma.Decimal;
  },
  customer: LatLng | null,
): Promise<Prisma.Decimal> {
  if (!customer || restaurant.deliveryPricingMode === 'DISABLED') return toDecimal(0);

  if (restaurant.deliveryPricingMode === 'DISTANCE') {
    if (restaurant.deliveryOriginLat == null || restaurant.deliveryOriginLng == null) return toDecimal(0);
    const distanceKm = haversineDistanceKm({ lat: restaurant.deliveryOriginLat, lng: restaurant.deliveryOriginLng }, customer);
    return round2(toDecimal(restaurant.deliveryBaseFee).add(toDecimal(restaurant.deliveryPricePerKm).mul(distanceKm)));
  }

  // ZONE: la primera zona cuyo polígono contenga al cliente define el precio.
  const zones = await prisma.deliveryZone.findMany({ where: { restaurantId: restaurant.id } });
  for (const zone of zones) {
    const polygon = zone.polygon as unknown as LatLng[];
    if (Array.isArray(polygon) && isPointInPolygon(customer, polygon)) {
      return round2(toDecimal(zone.price));
    }
  }
  return toDecimal(0);
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

/** Ventana de fecha para los filtros de reportes (hora de Caracas para "day"). */
function rangeFilter(range: 'day' | 'month' | 'year' | 'all'): { gte: Date } | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  if (range === 'day') return { gte: startOfTodayCaracas() };
  if (range === 'month') return { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  return { gte: new Date(now.getFullYear(), 0, 1) };
}

/**
 * Descuenta del inventario los insumos de cada producto vendido que tenga
 * receta. Se llama una sola vez, al marcar el pedido SERVED por primera vez.
 * El stock nunca baja de 0 (se recorta si hay menos existencia de la que
 * "debería" haber, en vez de fallar el cambio de estado).
 */
async function deductRecipeStock(restaurantId: string, items: { productId: string | null; quantity: number }[]) {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return;

  const recipeLines = await prisma.recipeIngredient.findMany({
    where: { restaurantId, productId: { in: productIds } },
  });
  if (recipeLines.length === 0) return;

  const qtyByProduct = new Map(items.map((i) => [i.productId, i.quantity]));

  for (const line of recipeLines) {
    const soldQty = qtyByProduct.get(line.productId) ?? 0;
    if (soldQty <= 0) continue;
    const used = toDecimal(line.quantity).mul(soldQty);

    const item = await prisma.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
    if (!item) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(item.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
  }
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
      include: {
        restaurant: {
          select: {
            id: true,
            baseCurrency: true,
            isActive: true,
            orderingEnabled: true,
            requireOrderConfirmation: true,
            serviceChargeEnabled: true,
            ivaEnabled: true,
          },
        },
      },
    });
    if (!table || !table.isActive || !table.restaurant.isActive) {
      throw notFound('Mesa no válida.');
    }
    if (!table.restaurant.orderingEnabled) {
      throw badRequest('Este restaurante no está aceptando pedidos en este momento.');
    }

    const restaurantId = table.restaurantId;
    const currency = table.restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, table.restaurant);
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      // Mientras la mesa esté "abierta", todos sus pedidos se acumulan en la
      // misma cuenta (TableSession). Solo el primer pedido pide nombre/cédula.
      let session = await tx.tableSession.findFirst({ where: { tableId: table.id, status: 'OPEN' } });

      // Si la cuenta ya existe (no es el primer pedido) y está protegida con
      // clave, hay que validarla antes de aceptar el pedido nuevo.
      if (session) {
        await tableSessionService.verifyPin(session, input.pin);
      }

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
          // Si el restaurante exige confirmación, el mesero debe aceptarla antes
          // de que llegue a cocina; si no, entra directo (comportamiento de siempre).
          status: table.restaurant.requireOrderConfirmation ? 'NEEDS_CONFIRMATION' : 'KITCHEN',
          tableId: table.id,
          tableSessionId: session.id,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          currency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
          totalBase,
          tipBase: input.tipBase ?? 0,
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

    // Empuja el aviso en tiempo real: si necesita confirmación el mesero la ve
    // en "Órdenes de Mesa"; si no, entra directo a la cola de cocina.
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
   *  PEDIDO MANUAL (staff, ej. Mesero, desde "Órdenes de Mesa")
   *  Mismo motor que checkoutDineIn, pero el tenant ya se conoce por el JWT
   *  (no por qrToken) y no se valida `orderingEnabled`: ese flag pausa el
   *  autoservicio del cliente, no aplica a que el staff cargue un pedido.
   * -------------------------------------------------------------------------
   */
  async createManualOrder(restaurantId: string, input: ManualOrderInput, placedByUserId?: string) {
    const table = await prisma.table.findFirst({ where: { id: input.tableId, restaurantId } });
    if (!table || !table.isActive) throw notFound('Mesa no válida.');

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true, serviceChargeEnabled: true, ivaEnabled: true },
    });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    const currency = restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, restaurant);
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const order = await prisma.$transaction(async (tx) => {
      let session = await tx.tableSession.findFirst({ where: { tableId: table.id, status: 'OPEN' } });

      if (!session) {
        if (!input.customerName || !input.customerIdNumber) {
          throw badRequest('Faltan los datos de facturación (nombre y cédula) para abrir la cuenta.');
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
          status: 'KITCHEN', // el mesero ya lo está tomando, entra directo a la cola de cocina
          tableId: table.id,
          tableSessionId: session.id,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          placedByUserId,
          currency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
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
  /**
   * Cotización en vivo del costo de envío (sin crear el pedido): el checkout
   * la llama apenas el cliente comparte su ubicación, para mostrarla antes
   * de enviar el pedido.
   */
  async getDeliveryQuote(restaurantSlug: string, lat: number, lng: number) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: {
        id: true,
        isActive: true,
        baseCurrency: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
      },
    });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');

    const feeBase = await computeDeliveryFee(restaurant, { lat, lng });
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency);
    const feeBs = baseToBs(feeBase, rate.rateBs);

    return { feeBase: feeBase.toFixed(2), feeBs: feeBs.toFixed(2), currency: restaurant.baseCurrency };
  },

  async checkoutDelivery(restaurantSlug: string, input: DeliveryCheckoutInput) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        whatsappPhone: true,
        isActive: true,
        orderingEnabled: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
      },
    });
    if (!restaurant || !restaurant.isActive) throw notFound('Restaurante no encontrado.');
    if (!restaurant.orderingEnabled) {
      throw badRequest('Este restaurante no está aceptando pedidos en este momento.');
    }
    if (!restaurant.whatsappPhone) {
      throw badRequest('El restaurante no tiene un número de WhatsApp configurado.');
    }

    const restaurantId = restaurant.id;
    const rate = await exchangeRateService.getRate(restaurant.baseCurrency);
    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant);

    const customerPoint =
      input.mode === 'DELIVERY' && input.customer.lat != null && input.customer.lng != null
        ? { lat: input.customer.lat, lng: input.customer.lng }
        : null;
    const deliveryFeeBase = await computeDeliveryFee(restaurant, customerPoint);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(deliveryFeeBase));
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
          serviceChargeBase,
          ivaBase,
          deliveryFeeBase,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerAddress: input.customer.locationUrl
            ? [input.customer.address, input.customer.locationUrl].filter(Boolean).join(' — ')
            : input.customer.address,
          customerLat: customerPoint?.lat,
          customerLng: customerPoint?.lng,
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

    // Notifica en vivo a la sección Delivery (y a Cocina, que también lista todos los canales).
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
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
      serviceChargeBase: serviceChargeBase.toString(),
      ivaBase: ivaBase.toString(),
      deliveryFeeBase: deliveryFeeBase.toString(),
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

  /** Cola de la sección Delivery: solo pedidos DELIVERY/PICKUP (WhatsApp) activos. */
  async listDeliveryQueue(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, channel: { in: ['DELIVERY', 'PICKUP'] }, status: { in: ['PENDING', 'KITCHEN'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: true },
    });
  },

  /** Edita cantidades de un pedido ya creado (Delivery). quantity: 0 quita el ítem del pedido. */
  async updateItems(restaurantId: string, orderId: string, updates: UpdateOrderItemsInput['items']) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: true },
    });
    if (!order) throw notFound('Comanda no encontrada.');
    if (order.status === 'SERVED' || order.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const itemById = new Map(order.items.map((i) => [i.id, i]));
    for (const u of updates) {
      if (!itemById.has(u.orderItemId)) throw badRequest('Uno de los productos no pertenece a este pedido.');
    }

    const updateQty = new Map(updates.map((u) => [u.orderItemId, u.quantity]));
    const remaining = order.items
      .map((it) => ({ ...it, quantity: updateQty.get(it.id) ?? it.quantity }))
      .filter((it) => it.quantity > 0);

    if (remaining.length === 0) {
      throw badRequest('El pedido debe tener al menos un producto.');
    }

    const subtotalBase = round2(
      remaining.reduce((acc, it) => acc.add(it.unitPrice.mul(it.quantity)), toDecimal(0)),
    );
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { serviceChargeEnabled: true, ivaEnabled: true },
    });
    const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, restaurant!);
    const totalBs = baseToBs(totalBase, order.exchangeRate);

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        if (u.quantity <= 0) {
          await tx.orderItem.delete({ where: { id: u.orderItemId } });
        } else {
          const original = itemById.get(u.orderItemId)!;
          await tx.orderItem.update({
            where: { id: u.orderItemId },
            data: { quantity: u.quantity, lineTotal: round2(original.unitPrice.mul(u.quantity)) },
          });
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { subtotalBase, serviceChargeBase, ivaBase, totalBase, totalBs },
      });
    });

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated!.status });
    return updated;
  },

  /** Cambia el estado de una comanda y notifica a la cocina. */
  async updateStatus(restaurantId: string, orderId: string, status: 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED') {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: true } });
    if (!existing) throw notFound('Comanda no encontrada.');

    const order = await prisma.order.update({ where: { id: orderId }, data: { status } });

    // Descuenta el inventario por receta la primera vez que se marca SERVED.
    if (status === 'SERVED' && existing.status !== 'SERVED') {
      await deductRecipeStock(restaurantId, existing.items);
    }

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

  /** El mesero acepta un pedido de mesa en NEEDS_CONFIRMATION: recién ahí llega a cocina. */
  async acceptOrder(restaurantId: string, orderId: string) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'NEEDS_CONFIRMATION' && existing.status !== 'PENDING') {
      throw badRequest('Este pedido ya fue aceptado o no está pendiente.');
    }

    const order = await prisma.order.update({ where: { id: orderId }, data: { status: 'KITCHEN' } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId: order.id, status: order.status });
    return order;
  },

  /** "Cancelar" desde el panel de Pedidos en vivo: borra el pedido, no queda registrado. */
  async deleteOrderHard(restaurantId: string, orderId: string) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    await prisma.order.delete({ where: { id: orderId } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: 'DELETED' });
    return { deleted: true };
  },

  /**
   * Todos los pedidos activos (no servidos ni cancelados), de cualquier
   * canal, para el panel "Pedidos" del Dashboard del restaurante.
   */
  async listLiveOrders(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, status: { notIn: ['SERVED', 'CANCELLED'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: true, table: { select: { number: true } } },
    });
  },

  /**
   * "Delivery": arma el enlace de WhatsApp para el repartidor con el resumen
   * de la comanda (sin precios) y los datos de contacto/ubicación del
   * cliente, para que pueda llamarlo o ubicarlo.
   */
  async dispatchToCourier(restaurantId: string, orderId: string, courierId: string) {
    const [order, courier] = await Promise.all([
      prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: true } }),
      prisma.deliveryCourier.findFirst({ where: { id: courierId, restaurantId } }),
    ]);
    if (!order) throw notFound('Comanda no encontrada.');
    if (!courier) throw notFound('Repartidor no encontrado.');

    const parts: string[] = [];
    parts.push(`*🛵 Pedido para entregar — #${order.orderNumber}*`);
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('*Comanda:*');
    for (const item of order.items) {
      parts.push(`• ${item.quantity}x ${item.productName}`);
      for (const mod of item.modifiers) parts.push(`     ↳ ${mod}`);
      if (item.note) parts.push(`     📝 ${item.note}`);
    }
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('*Datos del cliente:*');
    if (order.customerName) parts.push(`👤 ${order.customerName}`);
    if (order.customerPhone) parts.push(`📞 ${order.customerPhone}`);
    if (order.customerAddress) parts.push(`📍 ${order.customerAddress}`);
    if (order.customerLat != null && order.customerLng != null) {
      parts.push(`🗺️ https://www.google.com/maps?q=${order.customerLat},${order.customerLng}`);
    }
    if (order.customerNote) parts.push(`🗒️ Nota: ${order.customerNote}`);
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('_Enviado desde QuickTap.club_');

    const url = buildWhatsappUrl(courier.whatsappPhone, parts.join('\n'));

    // Queda registrado quién se lleva la comanda, para el movimiento por repartidor en Administración.
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryCourierId: courierId, deliveryDispatchedAt: new Date() },
    });

    return { url };
  },

  /** Resumen de ventas del día (hora de Caracas) para el Dashboard del restaurante. */
  async getTodaySummary(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true },
    });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: startOfTodayCaracas() },
        status: { not: 'CANCELLED' },
      },
      select: { channel: true, totalBase: true, totalBs: true, currency: true },
    });

    const totalBase = round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const totalBs = round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
    const byChannel: Record<OrderChannel, number> = { DINE_IN: 0, DELIVERY: 0, PICKUP: 0 };
    for (const o of orders) byChannel[o.channel]++;

    return {
      ordersCount: orders.length,
      totalBase: totalBase.toFixed(2),
      totalBs: totalBs.toFixed(2),
      currency: orders[0]?.currency ?? restaurant?.baseCurrency ?? 'USD',
      byChannel,
    };
  },

  /** Resumen de Administración (solo plan Premium): ventas de hoy, del mes y de siempre. */
  async getAdminSummary(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    function summarize(orders: { totalBase: Prisma.Decimal; totalBs: Prisma.Decimal; channel: OrderChannel }[]) {
      const totalBase = round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
      const totalBs = round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
      const byChannel: Record<OrderChannel, number> = { DINE_IN: 0, DELIVERY: 0, PICKUP: 0 };
      for (const o of orders) byChannel[o.channel]++;
      return { ordersCount: orders.length, totalBase: totalBase.toFixed(2), totalBs: totalBs.toFixed(2), byChannel };
    }

    const [todayOrders, monthOrders, allOrders] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: startOfTodayCaracas() }, status: { not: 'CANCELLED' } },
        select: { totalBase: true, totalBs: true, channel: true },
      }),
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
        select: { totalBase: true, totalBs: true, channel: true },
      }),
      prisma.order.findMany({
        where: { restaurantId, status: { not: 'CANCELLED' } },
        select: { totalBase: true, totalBs: true, channel: true },
      }),
    ]);

    return {
      currency: restaurant?.baseCurrency ?? 'USD',
      today: summarize(todayOrders),
      month: summarize(monthOrders),
      allTime: summarize(allOrders),
    };
  },

  /** Agrega/edita a mano la propina de un pedido, desde Administración. */
  async setTip(restaurantId: string, orderId: string, tipBase: number) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    return prisma.order.update({ where: { id: orderId }, data: { tipBase } });
  },

  /** Historial de pedidos con filtros (Administración, solo Premium). */
  async getOrderHistory(restaurantId: string, query: OrderHistoryQuery) {
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: rangeFilter(query.range),
    };
    if (query.channel) where.channel = query.channel;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.placedBy === 'staff') where.placedByUserId = { not: null };
    if (query.placedBy === 'customer') where.placedByUserId = null;

    const [total, orders, totalsAgg] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          orderNumber: true,
          channel: true,
          status: true,
          paymentMethod: true,
          totalBase: true,
          totalBs: true,
          tipBase: true,
          currency: true,
          customerName: true,
          createdAt: true,
          table: { select: { number: true } },
          placedByUser: { select: { name: true } },
        },
      }),
      prisma.order.aggregate({ where, _sum: { totalBase: true, totalBs: true, tipBase: true } }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalBase: round2(toDecimal(totalsAgg._sum.totalBase ?? 0)).toFixed(2),
      totalBs: round2(toDecimal(totalsAgg._sum.totalBs ?? 0)).toFixed(2),
      totalTipBase: round2(toDecimal(totalsAgg._sum.tipBase ?? 0)).toFixed(2),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        channel: o.channel,
        status: o.status,
        paymentMethod: o.paymentMethod,
        totalBase: o.totalBase.toFixed(2),
        totalBs: o.totalBs.toFixed(2),
        tipBase: o.tipBase.toFixed(2),
        currency: o.currency,
        customerName: o.customerName,
        placedByName: o.placedByUser?.name ?? null,
        table: o.table?.number ?? null,
        createdAt: o.createdAt,
      })),
    };
  },

  /** Reporte de productos más/menos vendidos, con filtro de rango de fecha. */
  async getProductReport(restaurantId: string, range: 'day' | 'month' | 'year' | 'all') {
    const items = await prisma.orderItem.findMany({
      where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt: rangeFilter(range) } },
      select: { productId: true, productName: true, quantity: true, lineTotal: true },
    });

    const byProduct = new Map<
      string,
      { productId: string | null; name: string; quantity: number; revenueBase: Prisma.Decimal }
    >();
    for (const item of items) {
      const key = item.productId ?? `name:${item.productName}`;
      const existing = byProduct.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenueBase = existing.revenueBase.add(item.lineTotal);
      } else {
        byProduct.set(key, {
          productId: item.productId,
          name: item.productName,
          quantity: item.quantity,
          revenueBase: toDecimal(item.lineTotal),
        });
      }
    }

    return Array.from(byProduct.values())
      .map((r) => ({ productId: r.productId, name: r.name, quantity: r.quantity, revenueBase: r.revenueBase.toFixed(2) }))
      .sort((a, b) => b.quantity - a.quantity);
  },

  /** Movimiento por repartidor (pedidos despachados y su valor), para Administración → Delivery. */
  async getCourierStats(restaurantId: string, range: 'day' | 'month' | 'year' | 'all') {
    const couriers = await prisma.deliveryCourier.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        deliveryCourierId: { not: null },
        status: { not: 'CANCELLED' },
        deliveryDispatchedAt: rangeFilter(range),
      },
      select: { deliveryCourierId: true, totalBase: true, totalBs: true, tipBase: true },
    });

    return couriers.map((c) => {
      const own = orders.filter((o) => o.deliveryCourierId === c.id);
      return {
        courierId: c.id,
        name: c.name,
        whatsappPhone: c.whatsappPhone,
        isActive: c.isActive,
        deliveries: own.length,
        totalBase: round2(own.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))).toFixed(2),
        totalBs: round2(own.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0))).toFixed(2),
        totalTipBase: round2(own.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0))).toFixed(2),
      };
    });
  },

  /** Movimiento por método de pago, para Administración. */
  async getPaymentMethodStats(restaurantId: string, range: 'day' | 'month' | 'year' | 'all') {
    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: rangeFilter(range) },
      select: { paymentMethod: true, totalBase: true, totalBs: true },
    });

    const byMethod = new Map<string, { count: number; totalBase: Prisma.Decimal; totalBs: Prisma.Decimal }>();
    for (const o of orders) {
      const key = o.paymentMethod ?? 'SIN_METODO';
      const entry = byMethod.get(key);
      if (entry) {
        entry.count += 1;
        entry.totalBase = entry.totalBase.add(o.totalBase);
        entry.totalBs = entry.totalBs.add(o.totalBs);
      } else {
        byMethod.set(key, { count: 1, totalBase: toDecimal(o.totalBase), totalBs: toDecimal(o.totalBs) });
      }
    }

    return Array.from(byMethod.entries())
      .map(([method, v]) => ({
        method,
        count: v.count,
        totalBase: round2(v.totalBase).toFixed(2),
        totalBs: round2(v.totalBs).toFixed(2),
      }))
      .sort((a, b) => b.count - a.count);
  },
};
