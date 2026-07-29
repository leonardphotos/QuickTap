import bcrypt from 'bcryptjs';
import { OrderChannel, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { baseToBs, CURRENCY_SYMBOLS, formatBs, formatMoney, round2, toDecimal } from '../../utils/money';
import {
  buildWhatsappCheckoutUrl,
  buildWhatsappUrl,
  DEFAULT_COMANDA_WHATSAPP_TEMPLATE,
  formatVenezuelanWhatsappPhone,
  renderWhatsappTemplate,
} from '../../utils/whatsapp';
import { emitToKitchen, emitToTable, SocketEvents } from '../../sockets';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { resolveDateFilter } from '../../utils/date-range';
import { hourCaracas, startOfTodayCaracas, startOfWeekCaracas } from '../../utils/timezone';
import { assertRestaurantOpen } from '../../utils/business-hours';
import { haversineDistanceKm, isPointInPolygon, LatLng } from '../../utils/geo';
import { tableSessionService } from '../table-sessions/table-session.service';
import { fiscalInvoicingService } from '../fiscal-invoicing/fiscal-invoicing.service';
import { writeFiscalAudit } from '../fiscal-invoicing/fiscal-invoicing.audit';
import { customerService } from '../customers/customer.service';
import {
  AddOrderItemInput,
  CartItemInput,
  ChangeChannelInput,
  DeliveryCheckoutInput,
  DineInCheckoutInput,
  ManualOrderInput,
  OrderHistoryQuery,
  RecordPaymentInput,
  ReportRange,
  UpdateOrderCustomerInput,
  UpdateOrderItemsInput,
} from './order.dto';

/**
 * ============================================================================
 *  Servicio de comandas — resuelve los dos canales de venta.
 * ============================================================================
 */

interface PricedLineModifier {
  // Id del Modifier del catálogo: se guarda en el snapshot solo para poder
  // resolver el insumo vinculado al descontar stock (ver deductModifierStock).
  modifierId: string;
  name: string;
  priceBase: Prisma.Decimal;
  // Cuántas veces se elige esta misma opción (ej. "Ketchup x4"), ver ModifierCategory.maxSelections.
  quantity: number;
}

interface PricedLine {
  productId: string;
  productName: string;
  // Nombre de la variante elegida (si el producto usa "Precio por variantes").
  variantName: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  modifiers: PricedLineModifier[];
  note?: string;
  // Snapshot de la cocina asignada al producto (null = sin asignar). Se
  // congela al pedir, igual que productName, para dividir la comanda.
  kitchenName: string | null;
}

/**
 * Toma los ítems del carrito, valida que los productos existan / estén
 * disponibles y pertenezcan al tenant, y CONGELA los precios desde la BD
 * (nunca se confía en el precio que envía el cliente). Si el producto usa
 * "Precio por variantes", resuelve la variante elegida; valida las categorías
 * de modificadores asociadas (obligatoria / uno-vs-varios) y suma sus precios.
 */
async function priceCart(restaurantId: string, items: CartItemInput[]): Promise<PricedLine[]> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId },
    include: {
      kitchen: { select: { name: true } },
      variants: true,
      modifierCategories: { include: { modifierCategory: { include: { modifiers: true } } } },
    },
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

    let basePrice = product.price;
    let variantName: string | null = null;
    if (product.pricingMode === 'VARIANTS') {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) throw badRequest(`Elige una variante para "${product.name}".`);
      if (!variant.isAvailable) throw badRequest(`"${variant.name}" no está disponible en este momento.`);
      basePrice = round2(
        variant.priceBase.add(variant.packagingFeeBase ?? 0).sub(variant.discountBase ?? 0),
      );
      variantName = variant.name;
    }

    // Categorías de modificadores asociadas al producto: valida obligatoriedad y el límite de
    // selecciones, y congela nombre + precio efectivo (precio - descuento) + cantidad de cada
    // modificador elegido. `modifierIds` es un multiset: un mismo id repetido N veces = "xN"
    // (ver ProductOptionsDialog.tsx / ProductDetailSheet.tsx), no un Set de ids únicos.
    const idCounts = new Map<string, number>();
    for (const id of item.modifierIds ?? []) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
    const modifierLines: PricedLineModifier[] = [];
    for (const link of product.modifierCategories) {
      const category = link.modifierCategory;
      const chosen = category.modifiers.filter((m) => idCounts.has(m.id));
      const totalSelected = chosen.reduce((acc, m) => acc + (idCounts.get(m.id) ?? 0), 0);
      const effectiveMin = category.minSelections ?? (category.isRequired ? 1 : 0);
      if (totalSelected < effectiveMin) {
        throw badRequest(
          effectiveMin <= 1
            ? `Elige una opción de "${category.name}" para "${product.name}".`
            : `Elige al menos ${effectiveMin} opciones de "${category.name}" para "${product.name}".`,
        );
      }
      const effectiveMax = link.maxSelectionsOverride ?? category.maxSelections ?? (category.allowMultiple ? Infinity : 1);
      if (totalSelected > effectiveMax) {
        throw badRequest(`Elige como máximo ${effectiveMax} opciones de "${category.name}" para "${product.name}".`);
      }
      for (const m of chosen) {
        if (!m.isAvailable) throw badRequest(`"${m.name}" no está disponible en este momento.`);
        const chosenQty = idCounts.get(m.id) ?? 1;
        if (m.maxQuantity != null && chosenQty > m.maxQuantity) {
          throw badRequest(`Elige como máximo ${m.maxQuantity} de "${m.name}" en "${product.name}".`);
        }
        modifierLines.push({
          modifierId: m.id,
          name: m.name,
          priceBase: round2(m.priceBase.sub(m.discountBase ?? 0)),
          quantity: chosenQty,
        });
      }
    }

    const modifiersTotal = modifierLines.reduce((acc, m) => acc.add(m.priceBase.mul(m.quantity)), toDecimal(0));
    const unitPrice = round2(basePrice.add(modifiersTotal));
    const lineTotal = round2(unitPrice.mul(item.quantity));

    return {
      productId: product.id,
      productName: product.name,
      variantName,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      modifiers: modifierLines,
      note: item.note,
      kitchenName: product.kitchen?.name ?? null,
    };
  });
}

/** Forma de nested-create de Prisma para un OrderItem a partir de una línea ya congelada. */
function buildOrderItemCreateData(line: PricedLine) {
  return {
    productId: line.productId,
    productName: line.productName,
    variantName: line.variantName,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal,
    note: line.note,
    kitchenName: line.kitchenName,
    modifiers: {
      create: line.modifiers.map((m) => ({
        modifierId: m.modifierId,
        name: m.name,
        priceBase: m.priceBase,
        quantity: m.quantity,
      })),
    },
  };
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
  let deducted = false;

  for (const line of recipeLines) {
    const soldQty = qtyByProduct.get(line.productId) ?? 0;
    if (soldQty <= 0) continue;
    const used = toDecimal(line.quantity).mul(soldQty);

    const item = await prisma.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
    if (!item) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(item.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
    deducted = true;
  }

  // Bajó el stock de al menos un insumo por receta: recalcula el aviso de "se está agotando".
  if (deducted) {
    emitToKitchen(restaurantId, SocketEvents.INVENTORY_LOW_STOCK, {});
  }
}

/**
 * Descuenta del inventario los insumos vinculados a los MODIFICADORES elegidos
 * (ej. "Extra queso" consume 30 gr del insumo Queso). Se llama junto con las
 * otras dos deducciones, una sola vez al marcar SERVED.
 *
 * Dos condiciones para que descuente:
 *  - El restaurante tiene el vínculo activado (botón en Inventario). Apagado,
 *    la configuración queda guardada pero no toca el stock.
 *  - El modificador tiene insumo y cantidad configurados.
 *
 * El consumo escala por las dos cantidades: cuántas veces se eligió el
 * modificador en la línea (ej. "Ketchup x3") POR cuántas unidades del producto
 * se vendieron. Nunca baja de 0.
 */
async function deductModifierStock(
  restaurantId: string,
  items: { quantity: number; modifiers: { modifierId: string | null; quantity: number }[] }[],
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { modifierInventoryLinkEnabled: true },
  });
  if (!restaurant?.modifierInventoryLinkEnabled) return;

  // Consumo total por insumo, acumulando todas las líneas del pedido.
  const usedByInventoryItem = new Map<string, Prisma.Decimal>();

  const modifierIds = [
    ...new Set(items.flatMap((i) => i.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id)))),
  ];
  if (modifierIds.length === 0) return;

  const modifiers = await prisma.modifier.findMany({
    where: { id: { in: modifierIds }, restaurantId, inventoryItemId: { not: null } },
    select: { id: true, inventoryItemId: true, inventoryQuantity: true },
  });
  if (modifiers.length === 0) return;
  const byModifierId = new Map(modifiers.map((m) => [m.id, m]));

  for (const item of items) {
    for (const chosen of item.modifiers) {
      if (!chosen.modifierId) continue;
      const link = byModifierId.get(chosen.modifierId);
      if (!link?.inventoryItemId || !link.inventoryQuantity) continue;

      // (consumo por unidad) x (veces elegido) x (unidades del producto vendidas)
      const used = toDecimal(link.inventoryQuantity).mul(chosen.quantity).mul(item.quantity);
      const prev = usedByInventoryItem.get(link.inventoryItemId) ?? toDecimal(0);
      usedByInventoryItem.set(link.inventoryItemId, prev.add(used));
    }
  }
  if (usedByInventoryItem.size === 0) return;

  let deducted = false;
  for (const [inventoryItemId, used] of usedByInventoryItem) {
    const inventoryItem = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, restaurantId } });
    if (!inventoryItem) continue;
    const nextQuantity = Prisma.Decimal.max(0, toDecimal(inventoryItem.quantity).sub(used));
    await prisma.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: nextQuantity } });
    deducted = true;
  }

  if (deducted) {
    emitToKitchen(restaurantId, SocketEvents.INVENTORY_LOW_STOCK, {});
  }
}

/**
 * Descuenta el stock simple de cada producto vendido que tenga control de stock activo
 * (independiente del sistema de insumos/receta). Se llama junto con `deductRecipeStock`,
 * una sola vez, al marcar el pedido SERVED por primera vez. Nunca baja de 0.
 */
async function deductProductStock(restaurantId: string, items: { productId: string | null; quantity: number }[]) {
  const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return;

  const products = await prisma.product.findMany({
    where: { restaurantId, id: { in: productIds }, stockControlEnabled: true },
    select: { id: true, stockQuantity: true },
  });
  if (products.length === 0) return;

  const qtyByProduct = new Map(items.map((i) => [i.productId, i.quantity]));

  for (const product of products) {
    const soldQty = qtyByProduct.get(product.id) ?? 0;
    if (soldQty <= 0) continue;
    const nextQuantity = Math.max(0, (product.stockQuantity ?? 0) - soldQty);
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: nextQuantity } });
  }
}

/** Inicio del período usado por getSalesStats/getSalesStatsUserOrders (semana o mes en curso) — debe coincidir en ambos para que los totales no se desalineen. */
function salesStatsPeriodStart(range: 'week' | 'month', now: Date): Date {
  return range === 'week' ? startOfWeekCaracas() : new Date(now.getFullYear(), now.getMonth(), 1);
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
    await assertRestaurantOpen(table.restaurantId);

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
      const openSessions = await tx.tableSession.findMany({ where: { tableId: table.id, status: 'OPEN' } });
      // Con varias cuentas abiertas a la vez, el autopedido público no puede saber a cuál
      // atribuir el pedido — eso queda para el mesero (ver CreateOrderDialog/TableOrdersPage).
      if (openSessions.length > 1) {
        throw conflict('Esta mesa tiene varias cuentas abiertas — pide ayuda al mesero para tu pedido.');
      }
      let session = openSessions[0] ?? null;

      // Si la cuenta ya existe (no es el primer pedido) y está protegida con
      // clave, hay que validarla antes de aceptar el pedido nuevo.
      if (session) {
        await tableSessionService.verifyPin(session, input.pin);
      }

      if (!session) {
        if (!input.customerName || !input.customerIdNumber || !input.customerPhone) {
          throw badRequest('Faltan tus datos de facturación (nombre, cédula y teléfono).');
        }
        session = await tx.tableSession.create({
          data: {
            restaurantId,
            tableId: table.id,
            customerName: input.customerName,
            customerIdNumber: input.customerIdNumber,
            customerPhone: input.customerPhone,
          },
        });
      }

      const orderNumber = await nextOrderNumber(tx, restaurantId);
      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          channel: 'DINE_IN',
          // Todo pedido que llega solo desde el cliente (menú público/QR de mesa) espera
          // a que Mesero/Caja/Admin/Dueño lo acepte antes de que llegue a cocina.
          status: 'NEEDS_CONFIRMATION',
          tableId: table.id,
          tableSessionId: session.id,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          customerPhone: session.customerPhone,
          currency,
          subtotalBase,
          serviceChargeBase,
          ivaBase,
          totalBase,
          tipBase: input.tipBase ?? 0,
          exchangeRate: rate.rateBs,
          totalBs,
          items: {
            create: lines.map((l) => buildOrderItemCreateData(l)),
          },
        },
        include: {
          items: { include: { modifiers: true } },
          table: { select: { number: true, zone: { select: { name: true } } } },
          placedByUser: { select: { name: true } },
        },
      });
    });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
    });

    // Empuja el aviso en tiempo real: si necesita confirmación el mesero la ve
    // en "Órdenes de Mesa"; si no, entra directo a la cola de cocina.
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      tableId: order.tableId,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
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
  async createManualOrder(restaurantId: string, input: ManualOrderInput, placedByUserId?: string, placedByRole?: string) {
    // Pedido generado por el kiosco de autoservicio (rol Comanda): no hay cajero presente
    // para cobrar en el momento, así que el pedido espera confirmación de pago antes de
    // llegar a cocina (ver `addPayment`, que lo pasa a KITCHEN al saldarse por completo).
    const isKioskOrder = placedByRole === 'COMANDA';
    // Un pedido que el propio staff carga a mano (Mesero/Cajero/Admin/Dueño) ya fue
    // verificado por quien lo tomó — entra directo a cocina, sin esperar que alguien
    // más lo acepte (a diferencia de los pedidos que llegan solos desde el cliente).
    const isStaffPlaced = !!placedByUserId && !isKioskOrder;
    await assertRestaurantOpen(restaurantId);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        baseCurrency: true,
        serviceChargeEnabled: true,
        ivaEnabled: true,
        deliveryPricingMode: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
        deliveryBaseFee: true,
        deliveryPricePerKm: true,
      },
    });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    // Cliente elegido del directorio (wizard → paso Clientes): sus datos rellenan
    // los campos de contacto que no vinieron sueltos en el formulario.
    const resolvedCustomer = input.customerId
      ? await prisma.customer.findFirst({ where: { id: input.customerId, restaurantId } })
      : null;
    // El kiosco no captura estos datos del cliente — mismos valores genéricos que ya
    // se usan para Barra/Pickup cargados desde Comanda, para no bloquear la apertura
    // de la cuenta de mesa cuando "Comer Aquí" abre una mesa nueva.
    const customerName = input.customerName || resolvedCustomer?.name || (isKioskOrder ? 'Autoservicio (kiosco)' : undefined);
    const customerPhone = input.customerPhone || resolvedCustomer?.phone || (isKioskOrder ? '0000000000' : undefined);
    const customerIdNumber =
      input.customerIdNumber || resolvedCustomer?.idNumber || (isKioskOrder ? 'AUTOSERVICIO' : undefined);
    const customerAddress = input.customerAddress || resolvedCustomer?.address || undefined;

    const currency = restaurant.baseCurrency;
    const rate = await exchangeRateService.getRate(currency);

    const lines = await priceCart(restaurantId, input.items);
    const subtotalBase = sumSubtotal(lines);
    const { serviceChargeBase, ivaBase } = calculateCharges(subtotalBase, restaurant);

    const customerPoint =
      input.channel === 'DELIVERY' && input.customerLat != null && input.customerLng != null
        ? { lat: input.customerLat, lng: input.customerLng }
        : null;
    const deliveryFeeBase = await computeDeliveryFee({ id: restaurantId, ...restaurant }, customerPoint);
    const totalBase = round2(subtotalBase.add(serviceChargeBase).add(ivaBase).add(deliveryFeeBase));
    const totalBs = baseToBs(totalBase, rate.rateBs);

    const itemsCreate = lines.map((l) => buildOrderItemCreateData(l));

    const order =
      input.channel === 'DINE_IN'
        ? await (async () => {
            const table = await prisma.table.findFirst({ where: { id: input.tableId, restaurantId } });
            if (!table || !table.isActive) throw notFound('Mesa no válida.');

            return prisma.$transaction(async (tx) => {
              let session: { id: string; customerName: string; customerIdNumber: string; customerPhone: string | null } | null = null;

              if (input.sessionId) {
                // Agregar a una cuenta específica (mesa con varias cuentas abiertas).
                session = await tx.tableSession.findFirst({
                  where: { id: input.sessionId, tableId: table.id, restaurantId, status: 'OPEN' },
                });
                if (!session) throw badRequest('Esa cuenta no existe o ya no está abierta.');
              } else if (!input.openNewAccount) {
                // Comportamiento de siempre: reusa la única cuenta abierta de la mesa, si la tiene.
                session = await tx.tableSession.findFirst({ where: { tableId: table.id, status: 'OPEN' } });
              }

              if (!session) {
                if (!customerName || !customerIdNumber || !customerPhone) {
                  throw badRequest('Faltan los datos de facturación (nombre, cédula y teléfono) para abrir la cuenta.');
                }
                session = await tx.tableSession.create({
                  data: {
                    restaurantId,
                    tableId: table.id,
                    customerName,
                    customerIdNumber,
                    customerPhone,
                    label: input.accountLabel,
                  },
                });
              }

              const orderNumber = await nextOrderNumber(tx, restaurantId);
              return tx.order.create({
                data: {
                  restaurantId,
                  orderNumber,
                  channel: 'DINE_IN',
                  // Cargado por staff: entra directo a cocina. Un pedido de kiosco (Comanda)
                  // en cambio espera confirmación de pago primero.
                  status: isKioskOrder ? 'NEEDS_PAYMENT' : isStaffPlaced ? 'KITCHEN' : 'PENDING',
                  tableId: table.id,
                  tableSessionId: session.id,
                  customerName: session.customerName,
                  customerIdNumber: session.customerIdNumber,
                  customerPhone: session.customerPhone,
                  placedByUserId,
                  currency,
                  subtotalBase,
                  serviceChargeBase,
                  ivaBase,
                  deliveryFeeBase,
                  totalBase,
                  exchangeRate: rate.rateBs,
                  totalBs,
                  awaitingPayment: input.paymentIntent === 'DEBT',
                  paymentMethod: input.paymentMethod,
                  items: { create: itemsCreate },
                },
                include: {
                  items: { include: { modifiers: true } },
                  table: { select: { number: true, zone: { select: { name: true } } } },
                  placedByUser: { select: { name: true } },
                },
              });
            });
          })()
        : // DELIVERY / PICKUP cargado a mano (ej. pedido por teléfono): sin mesa, PENDING hasta aceptarlo.
          await prisma.$transaction(async (tx) => {
            const orderNumber = await nextOrderNumber(tx, restaurantId);
            return tx.order.create({
              data: {
                restaurantId,
                orderNumber,
                channel: input.channel,
                // Cargado por staff: entra directo a cocina. Un pedido de kiosco (Comanda)
                // en cambio espera confirmación de pago primero.
                status: isKioskOrder ? 'NEEDS_PAYMENT' : isStaffPlaced ? 'KITCHEN' : 'PENDING',
                customerName,
                customerPhone,
                customerAddress: input.channel === 'DELIVERY' ? customerAddress : undefined,
                customerLat: input.channel === 'DELIVERY' ? input.customerLat : undefined,
                customerLng: input.channel === 'DELIVERY' ? input.customerLng : undefined,
                awaitingPayment: input.paymentIntent === 'DEBT',
                paymentMethod: input.paymentMethod,
                customerNote: input.customerNote,
                placedByUserId,
                currency,
                subtotalBase,
                serviceChargeBase,
                ivaBase,
                deliveryFeeBase,
                totalBase,
                exchangeRate: rate.rateBs,
                totalBs,
                items: { create: itemsCreate },
              },
              include: {
                items: { include: { modifiers: true } },
                table: { select: { number: true, zone: { select: { name: true } } } },
                placedByUser: { select: { name: true } },
              },
            });
          });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
      address: order.customerAddress,
    });

    // Un pedido de kiosco recién creado (NEEDS_PAYMENT) no debe imprimirse en cocina
    // todavía — solo el ticket de "Número de orden" para que el cliente vaya a pagar.
    // La comanda real se dispara desde `addPayment` cuando caja lo salda por completo.
    if (isKioskOrder) {
      emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
        type: 'orden-numero',
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        paymentMethod: order.paymentMethod,
      });
    }

    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      status: order.status,
      tableId: order.tableId,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
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
    await assertRestaurantOpen(restaurant.id);

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
            create: lines.map((l) => buildOrderItemCreateData(l)),
          },
        },
        include: { items: { include: { modifiers: true } } },
      });
    });

    await customerService.upsertFromOrder(restaurantId, {
      name: order.customerName,
      phone: order.customerPhone,
      idNumber: order.customerIdNumber,
      address: order.customerAddress,
    });

    // Notifica en vivo a la sección Delivery (y a Cocina, que también lista todos los canales).
    emitToKitchen(restaurantId, SocketEvents.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        // Congelados en el pedido: la Estación de Impresión los usa para mostrar
        // el monto de cada ítem en el recibo (la comanda de cocina los ignora).
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
        note: i.note,
        // Estación de cocina de este producto (snapshot congelado al crear el pedido):
        // la Estación de Impresión la usa para mandar cada comanda a la impresora
        // que el usuario asignó a esa cocina.
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      totalBase: order.totalBase,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
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
        variantName: l.variantName ?? undefined,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toString(),
        modifiers: l.modifiers.map((m) => ({ name: m.name, priceBase: m.priceBase.toString(), quantity: m.quantity })),
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
      include: { items: { include: { modifiers: true } }, table: { select: { number: true } } },
    });
  },

  /** Cola de la sección Delivery: solo pedidos DELIVERY/PICKUP (WhatsApp) activos. */
  async listDeliveryQueue(restaurantId: string) {
    return prisma.order.findMany({
      where: { restaurantId, channel: { in: ['DELIVERY', 'PICKUP'] }, status: { in: ['PENDING', 'KITCHEN'] } },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { modifiers: true } } },
    });
  },

  /** Edita cantidades de un pedido ya creado (Delivery). quantity: 0 quita el ítem del pedido. */
  async updateItems(restaurantId: string, orderId: string, updates: UpdateOrderItemsInput['items']) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { modifiers: true } } },
    });
    if (!order) throw notFound('Comanda no encontrada.');
    if (order.status === 'SERVED' || order.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const itemById = new Map(order.items.map((i) => [i.id, i]));
    for (const u of updates) {
      const item = itemById.get(u.orderItemId);
      if (!item) throw badRequest('Uno de los productos no pertenece a este pedido.');
      // No se puede reducir/quitar un producto por debajo de lo que ya se cobró (fraccionado por ítems)
      // — la plata ya cobrada quedaría sin producto que la respalde.
      if (u.quantity < item.paidQuantity) {
        throw badRequest(`No se puede reducir "${item.productName}" por debajo de lo ya cobrado (${item.paidQuantity}).`);
      }
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

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } } } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated!.status });
    return updated;
  },

  /** Añade un producto nuevo a un pedido ya creado (panel de Pedidos en vivo). */
  // Nota: a diferencia de checkoutDineIn/checkoutDelivery/createManualOrder (que SÍ
  // exigen que el restaurante esté abierto para arrancar un pedido nuevo), este método
  // solo AÑADE una línea a un pedido que ya existe — el horario público no debe bloquear
  // que el staff termine de editar una comanda ya en curso.
  async addItem(restaurantId: string, orderId: string, input: AddOrderItemInput) {
    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } });
    if (!order) throw notFound('Comanda no encontrada.');
    if (order.status === 'SERVED' || order.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const [line] = await priceCart(restaurantId, [
      { productId: input.productId, quantity: input.quantity, variantId: input.variantId, modifierIds: input.modifierIds, note: input.note },
    ]);

    const subtotalBase = round2(
      order.items
        .reduce((acc, it) => acc.add(it.unitPrice.mul(it.quantity)), toDecimal(0))
        .add(line.lineTotal),
    );
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { serviceChargeEnabled: true, ivaEnabled: true },
    });
    const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, restaurant!);
    const totalBs = baseToBs(totalBase, order.exchangeRate);

    await prisma.$transaction([
      prisma.orderItem.create({
        data: { orderId, ...buildOrderItemCreateData(line) },
      }),
      prisma.order.update({ where: { id: orderId }, data: { subtotalBase, serviceChargeBase, ivaBase, totalBase, totalBs } }),
    ]);

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } } } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated!.status });
    return updated;
  },

  /** Edita los datos del cliente de un pedido ya creado (nombre, teléfono, dirección, nota). */
  async updateCustomer(restaurantId: string, orderId: string, input: UpdateOrderCustomerInput) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }

    const updated = await prisma.order.update({ where: { id: orderId }, data: input });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Cambia el tipo (canal) de un pedido ya creado, ej. de Mesa a Delivery o viceversa. */
  async changeChannel(restaurantId: string, orderId: string, input: ChangeChannelInput) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede editar un pedido ya finalizado o cancelado.');
    }
    if (input.channel === existing.channel) return existing;

    let tableId: string | null = null;
    let tableSessionId: string | null = null;
    let deliveryFeeBase = toDecimal(0);
    let customerAddress: string | null = existing.customerAddress;
    let customerLat: number | null = existing.customerLat;
    let customerLng: number | null = existing.customerLng;

    if (input.channel === 'DINE_IN') {
      const table = await prisma.table.findFirst({ where: { id: input.tableId, restaurantId } });
      if (!table || !table.isActive) throw notFound('Mesa no válida.');

      const openSessions = await tableSessionService.listOpenForTable(table.id);
      if (openSessions.length > 1) {
        throw conflict('Esta mesa tiene varias cuentas abiertas — usa "Generar orden" desde Mesas para elegir a cuál agregarlo.');
      }
      if (openSessions.length === 1) {
        tableSessionId = openSessions[0].id;
      } else {
        if (!existing.customerName || !existing.customerIdNumber || !existing.customerPhone) {
          throw badRequest(
            'Faltan los datos de facturación (nombre, cédula y teléfono) del cliente para abrir la cuenta en esta mesa. Edítalos primero en "Datos del cliente".',
          );
        }
        const session = await prisma.tableSession.create({
          data: {
            restaurantId,
            tableId: table.id,
            customerName: existing.customerName,
            customerIdNumber: existing.customerIdNumber,
            customerPhone: existing.customerPhone,
          },
        });
        tableSessionId = session.id;
      }
      tableId = table.id;
      customerAddress = null;
      customerLat = null;
      customerLng = null;
    } else if (input.channel === 'DELIVERY') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, deliveryPricingMode: true, deliveryOriginLat: true, deliveryOriginLng: true, deliveryBaseFee: true, deliveryPricePerKm: true },
      });
      const customerPoint = input.customerLat != null && input.customerLng != null ? { lat: input.customerLat, lng: input.customerLng } : null;
      deliveryFeeBase = await computeDeliveryFee(restaurant!, customerPoint);
      customerAddress = input.customerAddress!;
      customerLat = input.customerLat ?? null;
      customerLng = input.customerLng ?? null;
    } else {
      // PICKUP / BAR: sin mesa ni envío.
      customerAddress = null;
      customerLat = null;
      customerLng = null;
    }

    const totalBase = round2(existing.subtotalBase.add(existing.serviceChargeBase).add(existing.ivaBase).add(deliveryFeeBase));
    const totalBs = baseToBs(totalBase, existing.exchangeRate);

    const updated = await prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id: orderId },
        data: {
          channel: input.channel,
          tableId,
          tableSessionId,
          customerAddress,
          customerLat,
          customerLng,
          deliveryFeeBase,
          totalBase,
          totalBs,
        },
      });
    });

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Cambia el estado de una comanda y notifica a la cocina. */
  async updateStatus(restaurantId: string, orderId: string, status: 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED') {
    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { modifiers: true } }, placedByUser: { select: { role: true } } },
    });
    if (!existing) throw notFound('Comanda no encontrada.');

    const order = await prisma.order.update({ where: { id: orderId }, data: { status } });

    // Descuenta el inventario por receta y el stock simple por producto, la primera vez que se marca SERVED.
    if (status === 'SERVED' && existing.status !== 'SERVED') {
      await deductRecipeStock(restaurantId, existing.items);
      await deductProductStock(restaurantId, existing.items);
      await deductModifierStock(restaurantId, existing.items);
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

    // Avisa a Caja (para despachar delivery) y al rol Numero (Autoservicio/Pickup)
    // que este pedido ya está listo — un pedido, un aviso, sin importar el canal.
    if (order.status === 'SERVED' && existing.status !== 'SERVED') {
      emitToKitchen(restaurantId, SocketEvents.ORDER_READY_STAFF, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        placedByRole: existing.placedByUser?.role ?? null,
      });
    }

    return order;
  },

  /**
   * Una estación de cocina marca lista su parte de la comanda (los ítems con
   * ese kitchenName, o sin cocina asignada si kitchenName es null). El pedido
   * completo pasa a SERVED (con sus mismos efectos: descuento de inventario,
   * aviso al cliente) solo cuando TODAS sus estaciones ya marcaron listo.
   */
  async markKitchenReady(restaurantId: string, orderId: string, kitchenName: string | null) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'PENDING' && existing.status !== 'KITCHEN') {
      throw badRequest('Este pedido ya no está en cocina.');
    }

    await prisma.orderItem.updateMany({
      where: { orderId, kitchenName, kitchenReadyAt: null },
      data: { kitchenReadyAt: new Date() },
    });

    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const allReady = items.every((it) => it.kitchenReadyAt !== null);

    if (allReady) {
      return this.updateStatus(restaurantId, orderId, 'SERVED');
    }

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: existing.status });
    return prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { modifiers: true } }, table: { select: { number: true } } } });
  },

  /**
   * Acepta un pedido que llegó solo (sin staff detrás) en NEEDS_CONFIRMATION/PENDING:
   * recién ahí llega a cocina. Cocina nunca puede aceptar — solo cocina lo que ya está
   * aceptado. Delivery/Pickup, además, solo lo puede aceptar Caja/Admin/Dueño (nunca
   * Mesero), porque implica coordinar cobro/despacho antes de mandarlo a cocina.
   */
  async acceptOrder(restaurantId: string, orderId: string, acceptedByUserId?: string, acceptedByRole?: string) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status !== 'NEEDS_CONFIRMATION' && existing.status !== 'PENDING') {
      throw badRequest('Este pedido ya fue aceptado o no está pendiente.');
    }
    if (acceptedByRole === 'KITCHEN') {
      throw forbidden('Cocina no puede aceptar pedidos.');
    }
    if (
      (existing.channel === 'DELIVERY' || existing.channel === 'PICKUP') &&
      acceptedByRole &&
      !(ADMIN_CASHIER_ROLES as readonly string[]).includes(acceptedByRole)
    ) {
      throw forbidden('Solo Caja, Administrador o Dueño pueden aceptar pedidos de delivery/pickup.');
    }

    // Registra quién aceptó el pedido del cliente (mesa/QR): junto con
    // placedByUserId, define qué pedidos ve el rol Mesero en el Dashboard.
    const shouldSetAcceptedBy = !existing.placedByUserId;
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'KITCHEN', acceptedByUserId: shouldSetAcceptedBy ? acceptedByUserId : undefined },
    });

    // Mesa sin mesero asignado: el primero que acepta un pedido de esa mesa
    // se la queda de forma permanente (Equipo → "Asignar mesas" la puede
    // reasignar después a mano).
    if (shouldSetAcceptedBy && acceptedByUserId && existing.tableId) {
      await prisma.table.updateMany({
        where: { id: existing.tableId, assignedWaiterId: null },
        data: { assignedWaiterId: acceptedByUserId },
      });
    }

    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId: order.id, status: order.status });
    return order;
  },

  /**
   * "Cancelar" desde el panel de Pedidos en vivo: borra el pedido, no queda registrado.
   * Un Mesero necesita el código de 6 dígitos que Dueño/Admin crean en Ajustes — el resto
   * de los roles (Dueño/Admin/Cajero) puede eliminar directo, sin código.
   */
  async deleteOrderHard(restaurantId: string, orderId: string, role: string, pin?: string) {
    if (role === 'WAITER') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { deleteOrderPinHash: true },
      });
      if (!restaurant?.deleteOrderPinHash) {
        throw badRequest('El dueño o administrador debe crear un código de 6 dígitos en Ajustes antes de poder eliminar comandas.');
      }
      if (!pin || !(await bcrypt.compare(pin, restaurant.deleteOrderPinHash))) {
        throw badRequest('Código incorrecto.');
      }
    }
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');

    // Inalterabilidad fiscal: un pedido con documento fiscal emitido NO se puede
    // eliminar. La corrección va por Nota de Crédito, nunca por borrado — y el
    // intento queda registrado en la pista de auditoría.
    if (await fiscalInvoicingService.hasLiveFiscalDocument(orderId)) {
      await writeFiscalAudit({
        restaurantId,
        orderId,
        event: 'DELETE_BLOCKED',
        actor: { actorType: 'USER', actorId: undefined, actorName: role },
        detail: { orderNumber: existing.orderNumber },
      });
      throw conflict(
        'Este pedido ya tiene una factura fiscal emitida y no se puede eliminar. Para reversarlo hay que emitir una nota de crédito.',
      );
    }

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
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, assignedWaiterId: true } },
        payments: true,
        placedByUser: { select: { id: true, name: true } },
      },
    });
  },

  /** Registra un cobro (botones "Pagar" / "Pago Fraccionado"). Si con esto se cubre el total, cierra la cuenta abierta.
   * Si `input.items` viene (fraccionar por ítems), el monto lo calcula esta función a partir de esas
   * líneas — el `amountBase` que mande el cliente se ignora en ese caso. */
  async addPayment(restaurantId: string, orderId: string, input: RecordPaymentInput) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { payments: true, items: true },
      });
      if (!order) throw notFound('Comanda no encontrada.');
      if (order.status === 'CANCELLED') throw badRequest('No se puede registrar un cobro en un pedido cancelado.');

      // "Saldado" cuenta lo cobrado en efectivo/transferencia MÁS los descuentos ya
      // otorgados (un descuento perdona esa parte de la deuda, no queda pendiente).
      const alreadySettled = order.payments.reduce(
        (acc, p) => acc.add(p.amountBase).add(p.discountBase ?? toDecimal(0)),
        toDecimal(0),
      );
      const balance = round2(order.totalBase.sub(alreadySettled));

      let amountBase: Prisma.Decimal;
      if (input.items?.length) {
        const itemById = new Map(order.items.map((i) => [i.id, i]));
        amountBase = toDecimal(0);
        for (const picked of input.items) {
          const item = itemById.get(picked.orderItemId);
          if (!item) throw badRequest('Uno de los productos no pertenece a este pedido.');
          const remaining = item.quantity - item.paidQuantity;
          if (picked.quantity > remaining) {
            throw badRequest(`Solo quedan ${remaining} sin cobrar de "${item.productName}".`);
          }
          amountBase = amountBase.add(item.unitPrice.mul(picked.quantity));
        }
        amountBase = round2(amountBase);
      } else {
        amountBase = toDecimal(input.amountBase!);
      }

      if (amountBase.gt(balance.add(0.01))) {
        throw badRequest(`El monto excede el saldo pendiente (${balance.toFixed(2)}).`);
      }

      const discountBase = input.discountPercent
        ? round2(balance.mul(input.discountPercent).div(100))
        : undefined;

      await tx.orderPayment.create({
        data: {
          orderId,
          amountBase,
          method: input.method,
          discountPercent: input.discountPercent,
          discountBase,
          referenceNumber: input.referenceNumber,
        },
      });

      if (input.items?.length) {
        for (const picked of input.items) {
          await tx.orderItem.update({
            where: { id: picked.orderItemId },
            data: { paidQuantity: { increment: picked.quantity } },
          });
        }
      }

      // Sin margen de tolerancia: hasta el último centavo debe quedar cobrado (o condonado
      // explícitamente vía descuento) antes de dar por saldada la cuenta.
      const settledBase = round2(alreadySettled.add(amountBase).add(discountBase ?? toDecimal(0)));
      const fullyPaid = settledBase.gte(order.totalBase);
      // Pedido de kiosco (Comanda): esperaba el pago para entrar a cocina — ya se saldó,
      // así que pasa directo a KITCHEN (nunca por "Aceptar", cocina solo verá "Listo").
      const releaseToKitchen = fullyPaid && order.status === 'NEEDS_PAYMENT';
      const updated = await tx.order.update({
        where: { id: orderId },
        data: fullyPaid ? { awaitingPayment: false, ...(releaseToKitchen ? { status: 'KITCHEN' } : {}) } : {},
        include: { items: { include: { modifiers: true } }, table: { select: { number: true } }, payments: true },
      });

      emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
      return { order: updated, releaseToKitchen, fullyPaid };
    }).then(async ({ order: updated, releaseToKitchen, fullyPaid }) => {
      // La comanda real (con ítems) recién se imprime ahora que el pedido está pagado —
      // fuera de la transacción para no bloquear el cobro si la Estación de Impresión
      // (un simple evento de socket) tarda o falla.
      if (releaseToKitchen) await this.printComanda(restaurantId, orderId);
      // Facturación fiscal (SENIAT, vía Unidigital): dispara después de confirmar el
      // pago, nunca dentro de la transacción — issueForOrder() nunca lanza (ver
      // fiscal-invoicing.service.ts), pero el .catch es una segunda red de seguridad
      // para que un fallo de red jamás afecte la respuesta de este cobro.
      if (fullyPaid) fiscalInvoicingService.issueForOrder(restaurantId, orderId).catch(() => undefined);
      return updated;
    });
  },

  /**
   * "Delivery": arma el enlace de WhatsApp para el repartidor con el resumen
   * de la comanda (sin precios) y los datos de contacto/ubicación del
   * cliente, para que pueda llamarlo o ubicarlo.
   */
  async dispatchToCourier(restaurantId: string, orderId: string, courierId: string) {
    const [order, courier] = await Promise.all([
      prisma.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { modifiers: true } } } }),
      prisma.deliveryCourier.findFirst({ where: { id: courierId, restaurantId } }),
    ]);
    if (!order) throw notFound('Comanda no encontrada.');
    if (!courier) throw notFound('Repartidor no encontrado.');

    const parts: string[] = [];
    parts.push(`*🛵 Pedido para entregar — #${order.orderNumber}*`);
    parts.push('━━━━━━━━━━━━━━━━━━━━');
    parts.push('*Comanda:*');
    for (const item of order.items) {
      parts.push(`• ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}`);
      for (const mod of item.modifiers) parts.push(`     ↳ ${mod.name}`);
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

  /**
   * Botón "Enviar vía WhatsApp" en el detalle de un pedido: arma el enlace
   * con el resumen de la comanda (mismos datos que "Imprimir comanda") y lo
   * envía al teléfono del cliente registrado en el pedido.
   */
  async sendComandaWhatsapp(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true } },
        restaurant: { select: { name: true, whatsappOrderMessageTemplate: true } },
      },
    });
    if (!order) throw notFound('Comanda no encontrada.');
    if (!order.customerPhone) {
      throw badRequest('Este pedido no tiene un teléfono de cliente registrado.');
    }

    const symbol = CURRENCY_SYMBOLS[order.currency];

    let header = `*🧾 Comanda #${order.orderNumber} — ${order.restaurant.name}*`;
    if (order.table) header += `\n🪑 Mesa ${order.table.number}`;

    const itemLines: string[] = [];
    for (const item of order.items) {
      itemLines.push(
        `• ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''} — ${formatMoney(item.lineTotal, symbol)}`,
      );
      for (const mod of item.modifiers) itemLines.push(`     ↳ ${mod.name}`);
      if (item.note) itemLines.push(`     📝 ${item.note}`);
    }

    const totalesLines: string[] = [`Subtotal: ${formatMoney(order.subtotalBase, symbol)}`];
    if (Number(order.serviceChargeBase) > 0) totalesLines.push(`Servicio: ${formatMoney(order.serviceChargeBase, symbol)}`);
    if (Number(order.ivaBase) > 0) totalesLines.push(`IVA: ${formatMoney(order.ivaBase, symbol)}`);
    if (Number(order.deliveryFeeBase) > 0) totalesLines.push(`Envío: ${formatMoney(order.deliveryFeeBase, symbol)}`);
    if (Number(order.tipBase) > 0) totalesLines.push(`Propina: ${formatMoney(order.tipBase, symbol)}`);
    totalesLines.push(`*Total: ${formatMoney(order.totalBase, symbol)}*`);
    totalesLines.push(`_Equivalente: ${formatBs(order.totalBs)}_`);

    // Los datos del pedido (ítems y totales) se calculan siempre desde la BD
    // y se insertan como bloques ya formateados; el restaurante solo puede
    // personalizar el texto alrededor (encabezado, cierre, branding).
    const template = order.restaurant.whatsappOrderMessageTemplate || DEFAULT_COMANDA_WHATSAPP_TEMPLATE;
    const message = renderWhatsappTemplate(template, {
      header,
      items: itemLines.join('\n'),
      totales: totalesLines.join('\n'),
    });

    // El teléfono del cliente se captura como número local venezolano (ej.
    // "0424-1234567", sin código de país) en los formularios de checkout/mesa,
    // a diferencia de restaurant.whatsappPhone que ya guarda el código de
    // marcación elegido en el registro.
    const customerWhatsapp = formatVenezuelanWhatsappPhone(order.customerPhone);
    return { url: buildWhatsappUrl(customerWhatsapp, message) };
  },

  /** Botón "Imprimir" del panel: reenvía la comanda a la estación de impresión (misma room de
   * cocina que recibe las comandas nuevas) para que la imprima en las impresoras conectadas. */
  async printComanda(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, zone: { select: { name: true } } } },
        placedByUser: { select: { name: true } },
      },
    });
    if (!order) throw notFound('Comanda no encontrada.');

    emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
      type: 'comanda',
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: i.note,
        kitchenName: i.kitchenName,
      })),
      totalBase: order.totalBase,
      currency: order.currency,
      createdAt: order.createdAt,
    });

    return { sent: true };
  },

  /** POST /api/v1/orders/:id/print-receipt — "¿Desea imprimir la cuenta?" al saldar el pedido: reenvía a la impresora de Caja. */
  async printReceipt(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: { include: { modifiers: true } },
        table: { select: { number: true, zone: { select: { name: true } } } },
        placedByUser: { select: { name: true } },
      },
    });
    if (!order) throw notFound('Pedido no encontrado.');

    emitToKitchen(restaurantId, SocketEvents.PRINT_REQUEST, {
      type: 'recibo',
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
      placedByUser: order.placedByUser?.name ?? null,
      customerName: order.customerName,
      items: order.items.map((i) => ({
        name: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toString(),
        lineTotal: i.lineTotal.toString(),
        modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: i.note,
        kitchenName: i.kitchenName,
      })),
      subtotalBase: order.subtotalBase,
      serviceChargeBase: order.serviceChargeBase,
      ivaBase: order.ivaBase,
      deliveryFeeBase: order.deliveryFeeBase,
      totalBase: order.totalBase,
      exchangeRate: order.exchangeRate,
      totalBs: order.totalBs,
      currency: order.currency,
      createdAt: order.createdAt,
    });

    return { sent: true };
  },

  /** Resumen de ventas del día (hora de Caracas) para el Dashboard del restaurante. */
  async getTodaySummary(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { baseCurrency: true },
    });
    const currency = restaurant?.baseCurrency ?? 'USD';
    const rate = await exchangeRateService.getRate(currency);

    const [orders, movements, latePayments] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: startOfTodayCaracas() }, status: { not: 'CANCELLED' } },
        select: { channel: true, totalBase: true, totalBs: true, currency: true, tipBase: true, createdAt: true },
      }),
      prisma.movement.findMany({
        where: { restaurantId, createdAt: { gte: startOfTodayCaracas() } },
        select: { type: true, amountBase: true },
      }),
      // Cuentas de días anteriores que se terminan de cobrar hoy: el dinero entró hoy aunque
      // la comanda sea vieja, así que ese cobro cuenta para el Balance de hoy (no para "ventas
      // de hoy" — eso sigue siendo solo lo creado hoy, para no inflar el conteo de pedidos).
      prisma.orderPayment.findMany({
        where: {
          createdAt: { gte: startOfTodayCaracas() },
          order: { restaurantId, createdAt: { lt: startOfTodayCaracas() }, status: { not: 'CANCELLED' } },
        },
        select: { amountBase: true },
      }),
    ]);

    const totalBase = round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const totalBs = round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
    const byChannel: Record<OrderChannel, number> = { DINE_IN: 0, DELIVERY: 0, PICKUP: 0, BAR: 0 };
    for (const o of orders) byChannel[o.channel]++;

    const tipBase = round2(orders.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0)));
    const avgTicketBase = orders.length > 0 ? round2(totalBase.div(orders.length)) : round2(toDecimal(0));

    // Ventas por hora (hora de Caracas): solo se devuelven las horas con al menos un pedido,
    // ordenadas cronológicamente — el rango de operación varía por restaurante.
    const byHourMap = new Map<number, { totalBase: Prisma.Decimal; ordersCount: number }>();
    for (const o of orders) {
      const hour = hourCaracas(o.createdAt);
      const bucket = byHourMap.get(hour) ?? { totalBase: toDecimal(0), ordersCount: 0 };
      bucket.totalBase = bucket.totalBase.add(o.totalBase);
      bucket.ordersCount++;
      byHourMap.set(hour, bucket);
    }
    const byHour = Array.from(byHourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, b]) => ({ hour, totalBase: round2(b.totalBase).toFixed(2), ordersCount: b.ordersCount }));

    // Ingresos = ventas del día + ingresos manuales (propinas sueltas, etc.).
    // Egresos = gastos del día (módulo de Gastos). Balance = ingresos - egresos.
    const incomeMovementsBase = round2(
      movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const egresosBase = round2(
      movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const latePaymentsBase = round2(latePayments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
    const ingresosBase = round2(totalBase.add(incomeMovementsBase).add(latePaymentsBase));
    const balanceBase = round2(ingresosBase.sub(egresosBase));

    return {
      ordersCount: orders.length,
      totalBase: totalBase.toFixed(2),
      totalBs: totalBs.toFixed(2),
      currency: orders[0]?.currency ?? currency,
      byChannel,
      ingresosBase: ingresosBase.toFixed(2),
      ingresosBs: baseToBs(ingresosBase, rate.rateBs).toFixed(2),
      egresosBase: egresosBase.toFixed(2),
      egresosBs: baseToBs(egresosBase, rate.rateBs).toFixed(2),
      balanceBase: balanceBase.toFixed(2),
      balanceBs: baseToBs(balanceBase, rate.rateBs).toFixed(2),
      tipBase: tipBase.toFixed(2),
      tipBs: baseToBs(tipBase, rate.rateBs).toFixed(2),
      avgTicketBase: avgTicketBase.toFixed(2),
      avgTicketBs: baseToBs(avgTicketBase, rate.rateBs).toFixed(2),
      byHour,
    };
  },

  /** Agrega/edita a mano la propina de un pedido, desde Administración. */
  async setTip(restaurantId: string, orderId: string, tipBase: number) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    return prisma.order.update({ where: { id: orderId }, data: { tipBase } });
  },

  /** Botón del reloj en Pedidos: activa/desactiva la cuenta abierta pendiente por cobrar. */
  async setAwaitingPayment(restaurantId: string, orderId: string, awaitingPayment: boolean) {
    const existing = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!existing) throw notFound('Comanda no encontrada.');
    if (existing.status === 'SERVED' || existing.status === 'CANCELLED') {
      throw badRequest('No se puede marcar como pendiente por pagar un pedido ya finalizado o cancelado.');
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data: { awaitingPayment } });
    emitToKitchen(restaurantId, SocketEvents.ORDER_UPDATED, { orderId, status: updated.status });
    return updated;
  },

  /** Historial de pedidos con filtros (Administración, solo Premium). Incluye el desglose completo de cada venta. */
  async getOrderHistory(restaurantId: string, query: OrderHistoryQuery) {
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: resolveDateFilter({ range: query.range, date: query.date }),
    };
    if (query.channel) where.channel = query.channel;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.placedBy === 'staff') where.placedByUserId = { not: null };
    if (query.placedBy === 'customer') where.placedByUserId = null;
    if (query.placedByUserId) where.placedByUserId = query.placedByUserId;
    if (query.productId) where.items = { some: { productId: query.productId } };

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
          subtotalBase: true,
          serviceChargeBase: true,
          ivaBase: true,
          deliveryFeeBase: true,
          totalBase: true,
          totalBs: true,
          tipBase: true,
          currency: true,
          customerName: true,
          createdAt: true,
          table: { select: { number: true } },
          placedByUser: { select: { name: true } },
          items: { select: { productId: true, productName: true, quantity: true, unitPrice: true, lineTotal: true } },
          payments: {
            select: { method: true, referenceNumber: true, amountBase: true, discountBase: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
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
        subtotalBase: o.subtotalBase.toFixed(2),
        serviceChargeBase: o.serviceChargeBase.toFixed(2),
        ivaBase: o.ivaBase.toFixed(2),
        deliveryFeeBase: o.deliveryFeeBase.toFixed(2),
        totalBase: o.totalBase.toFixed(2),
        totalBs: o.totalBs.toFixed(2),
        tipBase: o.tipBase.toFixed(2),
        currency: o.currency,
        customerName: o.customerName,
        placedByName: o.placedByUser?.name ?? null,
        table: o.table?.number ?? null,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toFixed(2),
          lineTotal: i.lineTotal.toFixed(2),
        })),
        payments: o.payments.map((p) => ({
          method: p.method,
          referenceNumber: p.referenceNumber,
          amountBase: p.amountBase.toFixed(2),
          discountBase: p.discountBase?.toFixed(2) ?? null,
          createdAt: p.createdAt,
        })),
      })),
    };
  },

  /** Lista el personal que ha cargado al menos un pedido (para el filtro "Mesero" del historial). */
  async listWaiters(restaurantId: string) {
    return prisma.user.findMany({
      where: { restaurantId, placedOrders: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
  },

  /** Reporte de productos más/menos vendidos, con filtro de rango o fecha exacta. Cada variante de precio cuenta como su propia fila. */
  async getProductReport(restaurantId: string, range: ReportRange, date?: string) {
    const items = await prisma.orderItem.findMany({
      where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) } },
      select: { productId: true, productName: true, variantName: true, quantity: true, lineTotal: true },
    });

    const byProduct = new Map<
      string,
      { productId: string | null; name: string; quantity: number; revenueBase: Prisma.Decimal }
    >();
    for (const item of items) {
      const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
      const key = `${item.productId ?? `name:${item.productName}`}:${item.variantName ?? ''}`;
      const existing = byProduct.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenueBase = existing.revenueBase.add(item.lineTotal);
      } else {
        byProduct.set(key, {
          productId: item.productId,
          name,
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
  async getCourierStats(restaurantId: string, range: ReportRange, date?: string) {
    const couriers = await prisma.deliveryCourier.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        deliveryCourierId: { not: null },
        status: { not: 'CANCELLED' },
        deliveryDispatchedAt: resolveDateFilter({ range, date }),
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
  async getPaymentMethodStats(restaurantId: string, range: ReportRange, date?: string) {
    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: resolveDateFilter({ range, date }) },
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

  /**
   * Estadísticas de ventas para el botón "Estadísticas" de Administración: total del
   * período (semana o mes en curso) vs. el mismo período inmediatamente anterior
   * (para el % de variación), más el desglose de ventas por usuario que cargó el pedido.
   */
  async getSalesStats(restaurantId: string, range: 'week' | 'month') {
    const now = new Date();
    const currentStart = salesStatsPeriodStart(range, now);
    const previousStart =
      range === 'week'
        ? new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);

    const [currentOrders, previousOrders] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: currentStart } },
        select: {
          totalBase: true,
          totalBs: true,
          placedByUserId: true,
          placedByUser: { select: { name: true } },
        },
      }),
      prisma.order.findMany({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: previousStart, lt: currentStart } },
        select: { totalBase: true },
      }),
    ]);

    const totalBase = round2(currentOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const totalBs = round2(currentOrders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0)));
    const previousTotalBase = round2(previousOrders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)));
    const changePercent =
      Number(previousTotalBase) > 0
        ? round2(totalBase.sub(previousTotalBase).div(previousTotalBase).mul(100)).toFixed(1)
        : null;

    const byUser = new Map<string, { name: string; count: number; totalBase: Prisma.Decimal }>();
    for (const o of currentOrders) {
      const key = o.placedByUserId ?? 'CUSTOMER';
      const name = o.placedByUser?.name ?? 'Cliente (auto-servicio)';
      const entry = byUser.get(key);
      if (entry) {
        entry.count += 1;
        entry.totalBase = entry.totalBase.add(o.totalBase);
      } else {
        byUser.set(key, { name, count: 1, totalBase: toDecimal(o.totalBase) });
      }
    }

    return {
      range,
      periodStart: currentStart.toISOString(),
      ordersCount: currentOrders.length,
      totalBase: totalBase.toFixed(2),
      totalBs: totalBs.toFixed(2),
      previousTotalBase: previousTotalBase.toFixed(2),
      changePercent,
      byUser: Array.from(byUser.entries())
        .map(([userId, v]) => ({ userId, name: v.name, count: v.count, totalBase: round2(v.totalBase).toFixed(2) }))
        .sort((a, b) => Number(b.totalBase) - Number(a.totalBase)),
    };
  },

  /**
   * Detalle de ventas dentro del mismo período que getSalesStats, para los drill-down de
   * Administración → Estadísticas: cada venta con su comanda completa y sus pagos.
   * userId acepta un id de usuario real, "CUSTOMER" (bucket de autoservicio) o "ALL"
   * (todas las ventas del período, sin filtrar por quién la cargó).
   */
  async getSalesStatsUserOrders(restaurantId: string, range: 'week' | 'month', userId: string) {
    const currentStart = salesStatsPeriodStart(range, new Date());

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: currentStart },
        ...(userId === 'ALL' ? {} : { placedByUserId: userId === 'CUSTOMER' ? null : userId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        paymentMethod: true,
        totalBase: true,
        totalBs: true,
        currency: true,
        customerName: true,
        createdAt: true,
        table: { select: { number: true } },
        items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true, lineTotal: true } },
        payments: {
          select: { method: true, referenceNumber: true, amountBase: true, discountBase: true, createdAt: true },
        },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      channel: o.channel,
      status: o.status,
      paymentMethod: o.paymentMethod,
      totalBase: o.totalBase.toFixed(2),
      totalBs: o.totalBs.toFixed(2),
      currency: o.currency,
      customerName: o.customerName,
      table: o.table?.number ?? null,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({
        productName: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
      payments: o.payments.map((p) => ({
        method: p.method,
        referenceNumber: p.referenceNumber,
        amountBase: p.amountBase.toFixed(2),
        discountBase: p.discountBase?.toFixed(2) ?? null,
        createdAt: p.createdAt,
      })),
    }));
  },
};
