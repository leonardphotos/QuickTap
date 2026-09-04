import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { computeRecipeStockDeltas, orderService } from '../orders/order.service';

/**
 * Snapshot de catálogo para el relé local (modo sin conexión).
 *
 * Es todo lo que la PC del restaurante necesita para seguir tomando pedidos si se cae el
 * internet: qué se vende, a qué precio, en qué mesas, y cuánto stock hay.
 *
 * ## Por qué el consumo viene precalculado
 *
 * Descontar inventario de verdad encadena recetas, preparaciones anidadas, porciones "a
 * elección del cliente" y envases — un motor grande que ya vive en `order.service.ts`. Portarlo
 * al relé sería duplicar lógica delicada y arriesgar que calcule distinto que la nube.
 *
 * En vez de eso, acá se resuelve UNA vez con el motor real: para cada producto (y cada
 * variante) se pregunta "¿cuánto insumo consume una unidad?" y se manda esa tabla plana ya
 * resuelta. El relé solo multiplica por la cantidad vendida.
 *
 * Es una APROXIMACIÓN a propósito: sirve para que el salón vea el stock bajar y sepa qué se
 * está acabando. El descuento de verdad lo hace la nube al sincronizar los pedidos, y el
 * siguiente snapshot pisa el stock local con el real — así una diferencia nunca se acumula.
 */

/** Consumo de una unidad de un producto (o de una variante puntual). */
interface ProductConsumption {
  productId: string;
  /** null = aplica al producto sin variantes, o como base de todas. */
  variantName: string | null;
  inventoryItemId: string;
  quantity: string;
}

interface ModifierConsumption {
  modifierId: string;
  inventoryItemId: string;
  quantity: string;
}

export const offlineService = {
  /**
   * Todo lo que el relé necesita, en una sola respuesta. Se llama cada pocos minutos mientras
   * hay internet, para que el relé esté listo el día que se caiga.
   */
  async catalogSnapshot(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        serviceChargeEnabled: true,
        serviceChargeChannels: true,
        ivaEnabled: true,
        modifierInventoryLinkEnabled: true,
      },
    });
    if (!restaurant) throw new Error('Restaurante no encontrado.');

    const [zones, tables, kitchens, products, modifierCategories, inventoryItems, rate] = await Promise.all([
      prisma.zone.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true, priority: true },
      }),
      prisma.table.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, zoneId: true, number: true, qrToken: true, seats: true, mergedIntoTableId: true },
      }),
      prisma.kitchen.findMany({ where: { restaurantId }, select: { id: true, name: true, priority: true } }),
      prisma.product.findMany({
        where: { restaurantId },
        select: {
          id: true,
          kitchenId: true,
          name: true,
          price: true,
          isAvailable: true,
          pricingMode: true,
          priority: true,
          category: { select: { name: true } },
          variants: {
            select: {
              id: true,
              name: true,
              priceBase: true,
              packagingFeeBase: true,
              discountBase: true,
              isAvailable: true,
              priority: true,
            },
          },
          modifierCategories: { select: { modifierCategoryId: true, maxSelectionsOverride: true } },
        },
      }),
      prisma.modifierCategory.findMany({
        where: { restaurantId },
        select: {
          id: true,
          name: true,
          isRequired: true,
          allowMultiple: true,
          maxSelections: true,
          minSelections: true,
          priority: true,
          modifiers: {
            select: {
              id: true,
              name: true,
              priceBase: true,
              discountBase: true,
              isAvailable: true,
              maxQuantity: true,
              priority: true,
              inventoryItemId: true,
              inventoryQuantity: true,
              variantPrices: { select: { variantId: true, priceBase: true } },
            },
          },
        },
      }),
      prisma.inventoryItem.findMany({
        where: { restaurantId },
        select: { id: true, name: true, unit: true, quantity: true, minQuantity: true },
      }),
      prisma.exchangeRate.findFirst({ where: { currency: restaurant.baseCurrency }, select: { rateBs: true } }),
    ]);

    // Credenciales para poder entrar si el corte dura más que la sesión de un mesero.
    //
    // Va el MISMO hash que guarda la nube (bcrypt), nunca la contraseña: el relé solo puede
    // comparar, no leer. Y solo los roles que atienden el salón — un dueño o administrador no
    // tiene nada que hacer en el panel durante un corte, y su credencial es la más sensible.
    const staff = await prisma.user.findMany({
      where: { restaurantId, role: { in: ['WAITER', 'CASHIER', 'KITCHEN'] } },
      select: { id: true, email: true, passwordHash: true, name: true, role: true },
    });

    // Cuentas ya abiertas. Sin esto, si el internet se cae con mesas ocupadas, el relé abriría
    // una cuenta NUEVA para una mesa que ya tenía la suya, y al sincronizar quedarían dos
    // cuentas abiertas para la misma mesa. Mandándolas, el relé reusa la que ya existe.
    const openSessions = await prisma.tableSession.findMany({
      where: { restaurantId, status: 'OPEN' },
      select: {
        id: true,
        tableId: true,
        customerName: true,
        customerIdNumber: true,
        customerPhone: true,
        label: true,
        openedAt: true,
      },
    });

    const { productConsumption, modifierConsumption } = await buildConsumptionMap(
      restaurantId,
      products,
      modifierCategories,
      restaurant.modifierInventoryLinkEnabled,
    );

    return {
      generatedAt: new Date().toISOString(),
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        baseCurrency: restaurant.baseCurrency,
        serviceChargeEnabled: restaurant.serviceChargeEnabled,
        serviceChargeChannels: restaurant.serviceChargeChannels,
        ivaEnabled: restaurant.ivaEnabled,
        exchangeRate: rate?.rateBs.toString() ?? '1',
      },
      zones,
      tables,
      kitchens,
      products: products.map((p) => ({
        id: p.id,
        kitchenId: p.kitchenId,
        name: p.name,
        price: p.price.toString(),
        isAvailable: p.isAvailable,
        pricingMode: p.pricingMode,
        priority: p.priority,
        categoryName: p.category?.name ?? null,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          priceBase: v.priceBase.toString(),
          packagingFeeBase: (v.packagingFeeBase ?? 0).toString(),
          discountBase: (v.discountBase ?? 0).toString(),
          isAvailable: v.isAvailable,
          priority: v.priority,
        })),
        modifierCategoryIds: p.modifierCategories.map((l) => ({
          modifierCategoryId: l.modifierCategoryId,
          maxSelectionsOverride: l.maxSelectionsOverride,
        })),
      })),
      modifierCategories: modifierCategories.map((c) => ({
        id: c.id,
        name: c.name,
        isRequired: c.isRequired,
        allowMultiple: c.allowMultiple,
        maxSelections: c.maxSelections,
        minSelections: c.minSelections,
        priority: c.priority,
        modifiers: c.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          priceBase: m.priceBase.toString(),
          discountBase: (m.discountBase ?? 0).toString(),
          isAvailable: m.isAvailable,
          maxQuantity: m.maxQuantity,
          priority: m.priority,
          variantPrices: m.variantPrices.map((vp) => ({
            variantId: vp.variantId,
            priceBase: vp.priceBase.toString(),
          })),
        })),
      })),
      // Sin contraseña puesta (invitado que nunca entró): no sirve cachear nada.
      credentials: staff
        .filter((u) => !!u.passwordHash)
        .map((u) => ({
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash as string,
          name: u.name,
          role: u.role,
        })),
      openSessions: openSessions.map((s) => ({
        id: s.id,
        tableId: s.tableId,
        customerName: s.customerName,
        customerIdNumber: s.customerIdNumber,
        customerPhone: s.customerPhone,
        label: s.label,
        openedAt: s.openedAt.toISOString(),
      })),
      inventoryItems: inventoryItems.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity.toString(),
        minQuantity: i.minQuantity.toString(),
      })),
      productConsumption,
      modifierConsumption,
    };
  },

  /**
   * Sube lo que el relé creó mientras no había internet.
   *
   * Tres cosas hacen que esto sea seguro de reintentar:
   *
   *  1. **Idempotencia por id.** El relé genera ids (cuid) al crear el pedido y los conserva;
   *     acá se insertan con ESE mismo id. Si la conexión se corta a mitad de la subida y el
   *     relé reintenta, los que ya entraron se saltan en vez de duplicarse.
   *
   *  2. **Numeración definitiva acá.** El relé numeró "R-1", "R-2" para poder imprimir algo
   *     durante el corte, pero el correlativo real solo puede darlo la nube, que es la única
   *     que ve todos los pedidos. Se asignan en orden cronológico, respetando cómo ocurrieron.
   *
   *  3. **El inventario lo descuenta el camino de siempre.** Para los que se sirvieron durante
   *     el corte se llama a `updateStatus(...'SERVED')`, el mismo que usa el panel — así el
   *     descuento por receta/modificadores/envases es idéntico, y su guarda atómica impide
   *     descontar dos veces si algo se reintenta.
   */
  async syncOrders(
    restaurantId: string,
    input: { sessions: SyncSessionInput[]; orders: SyncOrderInput[] },
  ) {
    const result = {
      sessionsCreated: 0,
      ordersCreated: 0,
      ordersSkipped: 0,
      served: 0,
      conflicts: 0,
      assigned: [] as { id: string; offlineTicketRef: string; orderNumber: number }[],
    };

    /** Guarda el pedido entero para que una persona lo revise, en vez de perderlo. */
    const recordConflict = async (
      order: SyncOrderInput,
      kind: 'SESSION_CLOSED' | 'TABLE_MISSING' | 'PRODUCT_MISSING' | 'OTHER',
      reason: string,
    ) => {
      await prisma.syncConflict.create({
        data: {
          restaurantId,
          kind,
          offlineTicketRef: order.offlineTicketRef,
          reason,
          payload: order as unknown as Prisma.InputJsonValue,
        },
      });
      result.conflicts += 1;
    };

    // --- Cuentas de mesa ---
    // Las que ya existían (venían en el snapshot) se saltan; solo se crean las que nacieron
    // durante el corte. Se hace primero porque los pedidos las referencian.
    const tablesMissing = new Set<string>();
    for (const session of input.sessions) {
      const exists = await prisma.tableSession.findUnique({ where: { id: session.id }, select: { id: true } });
      if (exists) continue;
      const table = await prisma.table.findFirst({ where: { id: session.tableId, restaurantId }, select: { id: true } });
      if (!table) {
        // La mesa se borró durante el corte. Los pedidos de esa cuenta se marcan como
        // conflicto más abajo, en vez de reventar toda la tanda con un error de clave foránea.
        tablesMissing.add(session.id);
        continue;
      }
      await prisma.tableSession.create({
        data: {
          id: session.id,
          restaurantId,
          tableId: session.tableId,
          customerName: session.customerName,
          customerIdNumber: session.customerIdNumber,
          customerPhone: session.customerPhone,
          label: session.label,
          status: session.status,
          openedAt: new Date(session.openedAt),
          closedAt: session.closedAt ? new Date(session.closedAt) : null,
        },
      });
      result.sessionsCreated += 1;
    }

    // --- Pedidos, en el orden en que ocurrieron de verdad ---
    const ordered = [...input.orders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const servedIds: string[] = [];

    for (const o of ordered) {
      const exists = await prisma.order.findUnique({ where: { id: o.id }, select: { id: true, orderNumber: true } });
      if (exists) {
        result.ordersSkipped += 1;
        result.assigned.push({ id: o.id, offlineTicketRef: o.offlineTicketRef, orderNumber: exists.orderNumber });
        continue;
      }

      // --- Conflictos: gana lo que ya está en la nube, esto queda para revisión humana ---

      if (o.tableSessionId && tablesMissing.has(o.tableSessionId)) {
        await recordConflict(o, 'TABLE_MISSING', 'La mesa de este pedido se eliminó mientras no había conexión.');
        continue;
      }

      if (o.tableSessionId) {
        const session = await prisma.tableSession.findUnique({
          where: { id: o.tableSessionId },
          select: { status: true },
        });
        if (!session) {
          await recordConflict(o, 'TABLE_MISSING', 'La cuenta de este pedido ya no existe en la nube.');
          continue;
        }
        // Esta es la que pasaría en silencio si no se revisara: la cuenta se cobró y se cerró
        // mientras el salón seguía cargándole pedidos sin saberlo.
        if (session.status === 'CLOSED') {
          await recordConflict(
            o,
            'SESSION_CLOSED',
            'La cuenta de esta mesa ya se había cerrado y cobrado cuando llegó este pedido.',
          );
          continue;
        }
      }

      const productIds = [...new Set(o.items.map((i) => i.productId).filter((id): id is string => !!id))];
      if (productIds.length > 0) {
        const found = await prisma.product.count({ where: { id: { in: productIds }, restaurantId } });
        if (found !== productIds.length) {
          await recordConflict(o, 'PRODUCT_MISSING', 'Algún producto de este pedido se eliminó mientras no había conexión.');
          continue;
        }
      }

      let created;
      try {
        created = await prisma.$transaction(async (tx) => {
        const orderNumber = await nextOrderNumberForSync(tx, restaurantId);
        return tx.order.create({
          data: {
            id: o.id,
            restaurantId,
            orderNumber,
            offlineTicketRef: o.offlineTicketRef,
            channel: 'DINE_IN',
            // Entra como KITCHEN aunque se haya servido offline: el paso a SERVED se hace
            // abajo por el camino normal, que es el que descuenta inventario.
            status: 'KITCHEN',
            tableId: o.tableId,
            tableSessionId: o.tableSessionId,
            currency: o.currency,
            subtotalBase: o.subtotalBase,
            serviceChargeBase: o.serviceChargeBase,
            ivaBase: o.ivaBase,
            totalBase: o.totalBase,
            exchangeRate: o.exchangeRate,
            totalBs: o.totalBs,
            tipBase: o.tipBase,
            customerName: o.customerName,
            customerIdNumber: o.customerIdNumber,
            customerPhone: o.customerPhone,
            placedByUserId: o.placedByUserId,
            createdAt: new Date(o.createdAt),
            items: {
              create: o.items.map((i) => ({
                id: i.id,
                productId: i.productId,
                productName: i.productName,
                variantName: i.variantName,
                unitPrice: i.unitPrice,
                quantity: i.quantity,
                lineTotal: i.lineTotal,
                note: i.note,
                kitchenName: i.kitchenName,
                modifiers: {
                  create: i.modifiers.map((m) => ({
                    id: m.id,
                    modifierId: m.modifierId,
                    name: m.name,
                    priceBase: m.priceBase,
                    quantity: m.quantity,
                  })),
                },
              })),
            },
          },
          select: { id: true, orderNumber: true },
        });
        });
      } catch (e) {
        // Cualquier otro fallo: se guarda el pedido entero y se sigue con los demás. Un solo
        // pedido problemático no puede dejar sin subir a todos los del corte.
        await recordConflict(o, 'OTHER', e instanceof Error ? e.message : 'No se pudo subir este pedido.');
        continue;
      }

      result.ordersCreated += 1;
      result.assigned.push({ id: created.id, offlineTicketRef: o.offlineTicketRef, orderNumber: created.orderNumber });
      if (o.status === 'SERVED') servedIds.push(created.id);
    }

    // Marcar servidos por el camino de siempre: descuenta inventario igual que el panel.
    for (const id of servedIds) {
      await orderService.updateStatus(restaurantId, id, 'SERVED');
      result.served += 1;
    }

    return result;
  },

  /** Conflictos sin resolver — lo que una persona tiene que mirar tras un corte. */
  async listConflicts(restaurantId: string, includeResolved = false) {
    return prisma.syncConflict.findMany({
      where: { restaurantId, ...(includeResolved ? {} : { resolvedAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  /**
   * Marca un conflicto como revisado. No aplica nada por su cuenta a propósito: si el pedido
   * hay que cobrarlo igual, el encargado lo carga a mano con los datos que quedaron guardados.
   * Aplicarlo solo podría cobrar dos veces una cuenta que ya se cerró.
   */
  async resolveConflict(restaurantId: string, id: string, userId: string) {
    const existing = await prisma.syncConflict.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Conflicto no encontrado.');
    return prisma.syncConflict.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: userId },
    });
  },
};

/**
 * Mismo criterio que `nextOrderNumber` de order.service.ts: candado por restaurante dentro de
 * la transacción, para que dos pedidos que entran a la vez no lean el mismo máximo y choquen
 * contra el índice único (restaurantId, orderNumber).
 */
async function nextOrderNumberForSync(tx: Prisma.TransactionClient, restaurantId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + restaurantId}))`;
  const last = await tx.order.findFirst({
    where: { restaurantId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

/**
 * Pregunta al motor real de recetas cuánto insumo consume UNA unidad de cada producto/variante,
 * y arma con eso una tabla plana que el relé pueda aplicar multiplicando.
 */
async function buildConsumptionMap(
  restaurantId: string,
  products: { id: string; variants: { name: string }[] }[],
  modifierCategories: {
    modifiers: { id: string; inventoryItemId: string | null; inventoryQuantity: unknown }[];
  }[],
  modifierLinkEnabled: boolean,
): Promise<{ productConsumption: ProductConsumption[]; modifierConsumption: ModifierConsumption[] }> {
  const productConsumption: ProductConsumption[] = [];

  for (const product of products) {
    // Un producto sin variantes se consulta una vez; uno con variantes, una por variante,
    // porque la receta puede diferir por tamaño.
    const variantNames: (string | null)[] = product.variants.length > 0 ? product.variants.map((v) => v.name) : [null];

    for (const variantName of variantNames) {
      const deltas = await computeRecipeStockDeltas(restaurantId, [
        { productId: product.id, variantName, quantity: 1, modifiers: [] },
      ]);
      for (const [inventoryItemId, qty] of deltas) {
        productConsumption.push({
          productId: product.id,
          variantName,
          inventoryItemId,
          quantity: qty.toString(),
        });
      }
    }
  }

  // Modificadores con insumo vinculado directo. Si el restaurante tiene el vínculo apagado,
  // la configuración existe pero no descuenta — se respeta igual que en producción.
  const modifierConsumption: ModifierConsumption[] = [];
  if (modifierLinkEnabled) {
    for (const category of modifierCategories) {
      for (const m of category.modifiers) {
        if (!m.inventoryItemId || m.inventoryQuantity == null) continue;
        modifierConsumption.push({
          modifierId: m.id,
          inventoryItemId: m.inventoryItemId,
          quantity: String(m.inventoryQuantity),
        });
      }
    }
  }

  return { productConsumption, modifierConsumption };
}

/**
 * ============================================================================
 *  Subida de lo que pasó sin internet
 * ============================================================================
 */

export interface SyncOrderInput {
  /** El id que el relé le puso al crearlo. Se conserva: es lo que hace la subida idempotente. */
  id: string;
  offlineTicketRef: string;
  status: 'KITCHEN' | 'SERVED';
  tableId: string | null;
  tableSessionId: string | null;
  currency: 'USD' | 'EUR';
  subtotalBase: string;
  serviceChargeBase: string;
  ivaBase: string;
  totalBase: string;
  exchangeRate: string;
  totalBs: string;
  tipBase: string;
  customerName: string | null;
  customerIdNumber: string | null;
  customerPhone: string | null;
  placedByUserId: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string | null;
    productName: string;
    variantName: string | null;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    note: string | null;
    kitchenName: string | null;
    modifiers: { id: string; modifierId: string | null; name: string; priceBase: string; quantity: number }[];
  }[];
}

export interface SyncSessionInput {
  id: string;
  tableId: string;
  customerName: string;
  customerIdNumber: string;
  customerPhone: string | null;
  label: string | null;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
}
