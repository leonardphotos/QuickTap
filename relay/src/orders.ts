import { Prisma } from '../node_modules/.prisma/relay-client/index.js';
import { relayDb } from './db.js';
import { baseToBs, calculateCharges, priceCart, PricingError, sumSubtotal, type CartItemInput } from './pricing.js';

/**
 * Crear un pedido de mesa mientras no hay internet.
 *
 * Espeja `createManualOrder` de `src/modules/orders/order.service.ts`, con dos diferencias
 * deliberadas:
 *
 *  1. **Numeración**: la nube usa un candado de Postgres + MAX()+1 para dar un correlativo
 *     único por restaurante. Acá eso no sirve: la nube y el relé son dos bases separadas y
 *     ambas darían los mismos números. El relé lleva su propio contador (`localNumber`) y
 *     estampa una referencia visible `R-1`, `R-2`… que se imprime en la comanda, para que el
 *     mesero sepa que ese pedido nació offline. El número definitivo lo asigna la nube al
 *     sincronizar (Fase 4).
 *
 *  2. **Efectos diferidos**: no manda push, no toca CRM ni descuenta inventario. Todo eso
 *     espera a la sincronización — descontar stock dos veces sería peor que descontarlo tarde.
 */

export interface CreateOfflineOrderInput {
  tableId: string;
  items: CartItemInput[];
  sessionId?: string;
  openNewAccount?: boolean;
  customerName?: string;
  customerIdNumber?: string;
  customerPhone?: string;
  placedByUserId?: string;
  placedByUserName?: string;
}

export class OrderError extends Error {}

export async function createOfflineOrder(restaurantId: string, input: CreateOfflineOrderInput) {
  const db = relayDb();

  const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new OrderError('Este relé todavía no tiene los datos del restaurante. Conéctate a internet una vez para sincronizarlo.');

  const table = await db.table.findFirst({ where: { id: input.tableId, restaurantId, isActive: true } });
  if (!table) throw new OrderError('Mesa no válida.');
  // Mesa unida a otra: la cuenta vive en la principal, igual que en producción.
  const accountTableId = table.mergedIntoTableId ?? table.id;

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, restaurantId },
    include: {
      kitchen: { select: { name: true } },
      variants: true,
      modifierCategories: {
        include: { modifierCategory: { include: { modifiers: { include: { variantPrices: true } } } } },
      },
    },
  });

  let lines;
  try {
    lines = priceCart(input.items, products);
  } catch (e) {
    if (e instanceof PricingError) throw new OrderError(e.message);
    throw e;
  }

  const subtotalBase = sumSubtotal(lines);
  const { serviceChargeBase, ivaBase, totalBase } = calculateCharges(subtotalBase, restaurant, 'DINE_IN');
  const totalBs = baseToBs(totalBase, restaurant.exchangeRate);

  return db.$transaction(async (tx) => {
    // --- Cuenta de la mesa ---
    let session = input.sessionId
      ? await tx.tableSession.findFirst({
          where: { id: input.sessionId, tableId: accountTableId, restaurantId, status: 'OPEN' },
        })
      : input.openNewAccount
        ? null
        : await tx.tableSession.findFirst({ where: { tableId: accountTableId, status: 'OPEN' } });

    if (input.sessionId && !session) throw new OrderError('Esa cuenta no existe o ya no está abierta.');

    if (!session) {
      if (!input.customerName) {
        throw new OrderError('Falta el nombre del cliente para abrir la cuenta.');
      }
      session = await tx.tableSession.create({
        data: {
          restaurantId,
          tableId: accountTableId,
          customerName: input.customerName,
          // Igual que al sentar a alguien de la lista de espera: sin cédula se usa "S/C".
          customerIdNumber: input.customerIdNumber || 'S/C',
          customerPhone: input.customerPhone,
        },
      });
    }

    // --- Correlativo local ---
    // Postgres es un solo escritor por transacción acá, y el relé es un único proceso, así que
    // MAX()+1 alcanza sin el candado que necesita la nube (donde hay muchos procesos a la vez).
    const last = await tx.order.findFirst({
      where: { restaurantId },
      orderBy: { localNumber: 'desc' },
      select: { localNumber: true },
    });
    const localNumber = (last?.localNumber ?? 0) + 1;

    const order = await tx.order.create({
      data: {
        restaurantId,
        localNumber,
        offlineTicketRef: `R-${localNumber}`,
        channel: 'DINE_IN',
        // Pedido cargado por el staff: entra directo a cocina, igual que en producción.
        status: 'KITCHEN',
        tableId: accountTableId,
        tableSessionId: session.id,
        currency: restaurant.baseCurrency,
        subtotalBase,
        serviceChargeBase,
        ivaBase,
        totalBase,
        exchangeRate: restaurant.exchangeRate,
        totalBs,
        customerName: session.customerName,
        customerIdNumber: session.customerIdNumber,
        customerPhone: session.customerPhone,
        placedByUserId: input.placedByUserId,
        placedByUserName: input.placedByUserName,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            variantName: l.variantName,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            note: l.note,
            kitchenName: l.kitchenName,
            modifiers: {
              create: l.modifiers.map((m) => ({
                modifierId: m.modifierId,
                name: m.name,
                priceBase: m.priceBase,
                quantity: m.quantity,
              })),
            },
          })),
        },
      },
      include: {
        items: { include: { modifiers: true } },
        table: { include: { zone: { select: { name: true } } } },
      },
    });

    return order;
  });
}

/**
 * Payload del evento `order:new`, con EXACTAMENTE la misma forma que emite la nube
 * (ver el emit de `checkoutDineIn` en order.service.ts). Es lo que permite que la Estación de
 * Impresión imprima sin cambiar una línea de su lógica: no distingue de dónde vino el pedido.
 *
 * La única diferencia visible: `offlineTicketRef` viaja como `orderNumber`, así la comanda sale
 * marcada "R-3" en vez de "#48" y el mesero sabe que nació sin conexión.
 */
export function toKitchenPayload(order: Awaited<ReturnType<typeof createOfflineOrder>>) {
  return {
    orderId: order.id,
    orderNumber: order.offlineTicketRef,
    channel: order.channel,
    status: order.status,
    tableId: order.tableId,
    table: order.table ? { number: order.table.number, zoneName: order.table.zone?.name ?? null } : null,
    placedByUser: order.placedByUserName ?? null,
    customerName: order.customerName,
    items: order.items.map((i) => ({
      name: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
      modifiers: i.modifiers.map((m) => ({
        name: m.name,
        priceBase: m.priceBase.toString(),
        quantity: m.quantity,
      })),
      note: i.note,
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
    /** Marca explícita para quien quiera distinguirlo (la comanda ya lo muestra en el número). */
    offline: true,
  };
}
