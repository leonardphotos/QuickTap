import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { puestosVendidosPorEvento } from './shop-installments.service';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import { customerService } from '../customers/customer.service';
import { round2, toDecimal } from '../../utils/money';
import { promotionDiscountOf, recordPromotionRedemption, resolvePromotionForRedeem } from '../promotions/promotion.service';
import { movementService } from '../movements/movement.service';
import { resolveDateFilter, type ReportRange } from '../../utils/date-range';
import { bucketSalesByDay, computeBreakEven, monthLabel, type BreakEvenResponse } from '../../utils/breakeven';
import type {
  CreateShopProductInput,
  UpdateShopProductInput,
  CreateShopSaleInput,
  CreateShopPurchaseInput,
  CreateShopAdjustmentInput,
  OpenShopTillInput,
  CloseShopTillInput,
  SetShopServiceSuppliesInput,
  CreateConsumptionPlanInput,
  ConsumePlanInput,
} from './shop.dto';

/**
 * Persistencia de QuickTap Shop (businessType = SHOP): catálogo, ventas, compras, ajustes de
 * stock, caja y categorías — contraparte de web/src/pages/admin/shop/shopSession.ts. Cada
 * mutación del hook de frontend dispara una llamada aquí; el frontend mantiene su propio
 * estado local optimista y reconcilia con lo que devuelve el servidor (ver shopSession.ts).
 */

/**
 * Aplica (o revierte) el consumo de insumos de los servicios de un ticket.
 *
 * `sign` = -1 al vender (descuenta) y +1 al devolver (repone), para que ambos caminos usen
 * exactamente el mismo cálculo y no puedan desalinearse. Es best-effort: si un insumo ya no
 * existe, la venta se registra igual — nunca se bloquea un cobro por el inventario. El stock
 * nunca queda negativo.
 */
async function applySupplyConsumption(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  items: { productId?: string | null; qty: number }[],
  sign: 1 | -1,
) {
  const serviceIds = [...new Set(items.map((it) => it.productId).filter((v): v is string => !!v))];
  if (serviceIds.length === 0) return;

  const recipes = await tx.shopServiceSupply.findMany({
    where: { restaurantId, serviceProductId: { in: serviceIds } },
  });
  if (recipes.length === 0) return;

  // Cuántas veces se vendió cada servicio en este ticket (sumando líneas repetidas — el mismo
  // corte puede aparecer dos veces, con barberos distintos).
  const soldByService = new Map<string, number>();
  for (const it of items) {
    if (!it.productId) continue;
    soldByService.set(it.productId, (soldByService.get(it.productId) ?? 0) + it.qty);
  }

  // Consumo total por insumo+variante, acumulando todos los servicios del ticket.
  const usedByVariant = new Map<string, { productId: string; v1: string; v2: string; qty: number }>();
  for (const line of recipes) {
    const sold = soldByService.get(line.serviceProductId) ?? 0;
    if (sold <= 0) continue;
    const key = `${line.supplyProductId}|${line.supplyV1}|${line.supplyV2}`;
    const prev = usedByVariant.get(key);
    const qty = (prev?.qty ?? 0) + line.quantity * sold;
    usedByVariant.set(key, { productId: line.supplyProductId, v1: line.supplyV1, v2: line.supplyV2, qty });
  }

  for (const u of usedByVariant.values()) {
    await tx.shopProductVariant.updateMany({
      where: { productId: u.productId, v1: u.v1, v2: u.v2 },
      data: { stock: { increment: sign * u.qty } },
    });
    await tx.shopProductVariant.updateMany({
      where: { productId: u.productId, v1: u.v1, v2: u.v2, stock: { lt: 0 } },
      data: { stock: 0 },
    });
  }
}

export const shopService = {
  /** Carga inicial única: todo lo que ShopLayout necesita para hidratar la sesión. */
  async getState(restaurantId: string) {
    const [products, sales, purchases, adjustments, categories, subcategories, till, closedTills, serviceSupplies] = await Promise.all([
      prisma.shopProduct.findMany({ where: { restaurantId }, include: { variants: true }, orderBy: { createdAt: 'asc' } }),
      prisma.shopSale.findMany({ where: { restaurantId }, include: { items: true }, orderBy: { time: 'desc' } }),
      prisma.shopPurchase.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopStockAdjustment.findMany({ where: { restaurantId }, orderBy: { time: 'desc' } }),
      prisma.shopCategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopSubcategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } }),
      prisma.shopCashSession.findMany({ where: { restaurantId, closedAt: { not: null } }, orderBy: { closedAt: 'desc' } }),
      prisma.shopServiceSupply.findMany({ where: { restaurantId } }),
    ]);

    const subcategoriesByCategory: Record<string, string[]> = {};
    for (const s of subcategories) {
      (subcategoriesByCategory[s.category] ??= []).push(s.name);
    }

    // Puestos ya vendidos de cada evento, para que el panel muestre el cupo restante sin tener
    // que recorrer las ventas del lado del navegador.
    const eventSeatsSold = await puestosVendidosPorEvento(restaurantId);

    return { products, sales, purchases, adjustments, categories: categories.map((c) => c.name), subcategories: subcategoriesByCategory, till, closedTills, serviceSupplies, eventSeatsSold };
  },

  /**
   * Profesionales que prestan servicios (barberos/estilistas) para el selector "Atendido por"
   * del POS. A propósito NO reutiliza `/team` (que devuelve el `paymentMethodsConfig` de TODO
   * el personal, pensado para que Ajustes → Equipo lo administre): en una barbería cada
   * profesional cobra con sus propios datos de Pago Móvil/Zelle, y si el que pide la lista es
   * él mismo un barbero, no debe recibir ni ver — ni siquiera en la respuesta de red — los
   * datos de cobro de sus compañeros. Solo alguien que NO presta servicios (recepción, un
   * administrador que no es barbero) puede ver la lista completa, porque necesita elegir a
   * quién se le paga.
   */
  async listServiceProviders(restaurantId: string, requestingUserId: string) {
    const providers = await prisma.user.findMany({
      where: { restaurantId, isServiceProvider: true, isActive: true },
      select: { id: true, name: true, commissionPercent: true, paymentMethodsConfig: true },
      orderBy: { name: 'asc' },
    });
    const self = providers.find((p) => p.id === requestingUserId);
    return self ? [self] : providers;
  },

  // --- Catálogo ---

  async createProduct(restaurantId: string, input: CreateShopProductInput) {
    const product = await prisma.shopProduct.create({
      data: {
        restaurantId,
        name: input.name,
        category: input.category,
        subcategory: input.subcategory ?? '',
        brand: input.brand ?? '',
        sku: input.sku ?? '',
        location: input.location ?? '',
        // Eventos: fecha y cupo viajan con el producto (ver ShopProduct.isEvent).
        saleUnit: input.saleUnit ?? 'UND',
        isEvent: input.isEvent ?? false,
        eventDate: input.eventDate ?? null,
        eventSeats: input.eventSeats ?? null,
        price: input.price,
        cost: input.cost,
        minStock: input.minStock,
        wholesalePrice: input.wholesalePrice,
        wholesaleMinQty: input.wholesaleMinQty,
        promoPrice: input.promoPrice,
        expiryDate: input.expiryDate,
        photoUrl: input.photoUrl,
        pricingMode: input.pricingMode ?? 'UNIT',
        rollWidths: input.rollWidths ?? undefined,
        rollLengthM: input.rollLengthM,
        consumptionPlanEnabled: input.consumptionPlanEnabled ?? false,
        consumptionPlanRate: input.consumptionPlanRate,
        consumptionPlanSizes: input.consumptionPlanSizes ?? undefined,
        variants: { createMany: { data: input.variants } },
      },
      include: { variants: true },
    });
    await this.ensureCategory(restaurantId, input.category, input.subcategory);

    // El stock con el que nace el producto es su primer lote: si no, "lote 1" no existiría y
    // esa mercancía saldría sin costo al venderse (ver el consumo por lotes en recordSale).
    const stockInicial = product.variants.reduce((a, v) => a + v.stock, 0);
    if (stockInicial > 0) {
      const conStock = product.variants.find((v) => v.stock > 0)!;
      await prisma.shopPurchase.create({
        data: {
          restaurantId,
          supplier: 'Existencia inicial',
          productId: product.id,
          productName: product.name,
          v1: conStock.v1,
          v2: conStock.v2,
          qty: stockInicial,
          cost: input.cost,
          remainingQty: stockInicial,
          lotNumber: 1,
        },
      });
    }

    return product;
  },

  /** Lectura puntual, para el control de aprobación (ver shop.controller.ts -> pidePermiso). */
  async getProduct(restaurantId: string, id: string) {
    return prisma.shopProduct.findFirst({ where: { id, restaurantId }, select: { id: true, name: true, price: true } });
  },

  async getSale(restaurantId: string, id: string) {
    return prisma.shopSale.findFirst({ where: { id, restaurantId }, select: { id: true, total: true, time: true, customerName: true } });
  },

  async updateProduct(restaurantId: string, id: string, input: UpdateShopProductInput) {
    const existing = await prisma.shopProduct.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Producto no encontrado.');

    const { variants, ...fields } = input;
    const product = await prisma.$transaction(async (tx) => {
      if (variants) {
        await tx.shopProductVariant.deleteMany({ where: { productId: id } });
      }
      return tx.shopProduct.update({
        where: { id },
        data: {
          ...fields,
          ...(variants ? { variants: { createMany: { data: variants } } } : {}),
        },
        include: { variants: true },
      });
    });

    if (input.category) await this.ensureCategory(restaurantId, input.category, input.subcategory);
    return product;
  },

  // ─── Plan de consumo ────────────────────────────────────────────────────

  /** Planes activos (con saldo) de un producto+teléfono — lo que el POS consulta al agregar el
   * producto al carrito, para ofrecer "descontar del plan" si el cliente tiene uno vigente. */
  async findActivePlan(restaurantId: string, productId: string, customerPhone: string) {
    return prisma.shopConsumptionPlan.findFirst({
      where: { restaurantId, productId, customerPhone, closedAt: null, remainingUnits: { gt: 0 } },
      orderBy: { createdAt: 'asc' }, // el más viejo primero: no se le vence saldo al cliente por vender del nuevo antes.
    });
  },

  /** Todos los planes del local, para la pantalla de Administración → Planes de consumo. */
  async listPlans(restaurantId: string) {
    return prisma.shopConsumptionPlan.findMany({
      where: { restaurantId },
      include: { product: { select: { name: true } } },
      orderBy: [{ closedAt: 'asc' }, { createdAt: 'desc' }],
    });
  },

  /**
   * Activa un plan nuevo: el paquete ya se cobró (viaja como línea del carrito en la venta que
   * lo originó — ver ShopPosPage), esto solo dobla el registro para llevar el saldo.
   */
  async createConsumptionPlan(restaurantId: string, input: CreateConsumptionPlanInput) {
    const product = await prisma.shopProduct.findFirst({
      where: { id: input.productId, restaurantId },
      select: { consumptionPlanEnabled: true, consumptionPlanRate: true, saleUnit: true },
    });
    if (!product) throw notFound('Producto no encontrado.');
    if (!product.consumptionPlanEnabled || !product.consumptionPlanRate) {
      throw badRequest('Este producto no tiene plan de consumo activado.');
    }
    return prisma.shopConsumptionPlan.create({
      data: {
        restaurantId,
        productId: input.productId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.replace(/\D/g, ''),
        totalUnits: input.totalUnits,
        remainingUnits: input.totalUnits,
        ratePerUnit: product.consumptionPlanRate,
        totalPaid: input.totalPaid,
        activatedSaleId: input.activatedSaleId,
      },
    });
  },

  /**
   * Descuenta unidades de un plan activo. Candado por PLAN durante la transacción: dos ventas
   * consumiendo el mismo plan a la vez (dos cajas del mismo local) podrían leer el mismo saldo
   * y dejarlo en negativo — mismo patrón que el candado de pagos en order.service.ts.
   */
  async consumePlan(restaurantId: string, planId: string, input: ConsumePlanInput) {
    return prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${'consumption-plan:' + planId})) AS locked
      `;
      if (!locked) throw badRequest('Se está descontando este mismo plan en otra caja. Espera un momento.');

      const plan = await tx.shopConsumptionPlan.findFirst({ where: { id: planId, restaurantId } });
      if (!plan) throw notFound('Plan no encontrado.');
      if (plan.remainingUnits < input.units - 0.001) {
        throw badRequest(`El plan solo tiene ${plan.remainingUnits} disponibles.`);
      }
      const remainingUnits = Math.round((plan.remainingUnits - input.units) * 1000) / 1000;
      return tx.shopConsumptionPlan.update({
        where: { id: planId },
        data: { remainingUnits, closedAt: remainingUnits <= 0.001 ? new Date() : null },
      });
    });
  },

  /** Cierre manual — cliente que no va a volver por el resto. */
  async closePlan(restaurantId: string, planId: string) {
    const { count } = await prisma.shopConsumptionPlan.updateMany({
      where: { id: planId, restaurantId, closedAt: null },
      data: { closedAt: new Date() },
    });
    if (count === 0) throw notFound('Plan no encontrado o ya estaba cerrado.');
    return { ok: true };
  },

  /**
   * Aumento general de los precios de venta del local.
   *
   * Solo toca `price`: el costo no se mueve (no cambió lo que se pagó por la mercancía) y los
   * precios especiales —mayorista y promoción— tampoco, porque son acuerdos puntuales que el
   * dueño fijó a mano y subirlos de rebote rompería esos tratos sin que se entere.
   *
   * Se redondea a 2 decimales para no dejar precios con fracciones de centavo.
   */
  async raisePrices(restaurantId: string, percent: number) {
    if (percent === 0) throw badRequest('El aumento no puede ser 0%.');
    if (percent < -90 || percent > 500) throw badRequest('El aumento debe estar entre -90% y 500%.');
    const factor = 1 + percent / 100;
    const result = await prisma.$executeRaw`
      UPDATE shop_products
         SET price = ROUND((price * ${factor})::numeric, 2)
       WHERE "restaurantId" = ${restaurantId}
         AND price > 0
    `;
    return { updated: result, percent };
  },

  /**
   * Cuánto se vendió por categoría y por producto, en la unidad de cada uno.
   *
   * Para lo que se vende por Kg o Mt, `qty` ya viene en esa unidad, así que sumarlo responde
   * directo "cuántos kilos de manguera se vendieron" sin conversiones. Se separa por unidad
   * para no sumar kilos con unidades en el mismo número, que no querría decir nada.
   */
  /**
   * Estadísticas de venta del local (Administración → Estadísticas). Es el equivalente de
   * /orders/reports/sales-stats de restaurantes, pero sobre ShopSale en vez de Order — un local
   * no tiene pedidos ni mesas, vende en el punto de venta.
   *
   * Siempre compara contra el período inmediatamente anterior de la MISMA duración: "$1.200 esta
   * semana" no dice nada solo; "$1.200, 18% menos que la semana pasada" sí. Por eso el tramo
   * anterior se calcula corriendo las mismas fechas hacia atrás, no usando "el mes pasado".
   *
   * Las devueltas se excluyen: una venta anulada no es venta y contarla infla el período y,
   * peor, el ranking del vendedor que la hizo.
   */
  async salesStats(restaurantId: string, range: 'week' | 'month', desde?: string, hasta?: string) {
    const ahora = new Date();
    const custom = !!(desde && hasta);

    const hastaFecha = custom ? new Date(`${hasta}T23:59:59`) : ahora;
    const desdeFecha = custom
      ? new Date(`${desde}T00:00:00`)
      : new Date(ahora.getTime() - (range === 'week' ? 7 : 30) * 24 * 60 * 60 * 1000);

    const duracion = hastaFecha.getTime() - desdeFecha.getTime();
    const desdePrevio = new Date(desdeFecha.getTime() - duracion);

    const [actuales, previas] = await Promise.all([
      prisma.shopSale.findMany({
        where: { restaurantId, returned: false, time: { gte: desdeFecha, lte: hastaFecha } },
        select: { id: true, total: true, soldByUserId: true, soldByUserName: true, time: true, items: { select: { qty: true, price: true, cost: true } } },
      }),
      prisma.shopSale.findMany({
        where: { restaurantId, returned: false, time: { gte: desdePrevio, lt: desdeFecha } },
        select: { id: true, total: true },
      }),
    ]);

    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const total = actuales.reduce((a, v) => a + v.total, 0);
    const totalPrevio = previas.reduce((a, v) => a + v.total, 0);
    const costo = actuales.reduce((a, v) => a + v.items.reduce((b, it) => b + it.cost * it.qty, 0), 0);

    // Ranking por vendedor: el nombre viene congelado en la venta, así que sigue saliendo bien
    // aunque después se le cambie el nombre al usuario o se le dé de baja.
    const porUsuario = new Map<string, { userId: string; name: string; count: number; total: number }>();
    for (const v of actuales) {
      const key = v.soldByUserId ?? 'SIN_USUARIO';
      const fila = porUsuario.get(key) ?? { userId: key, name: v.soldByUserName ?? 'Sin registrar', count: 0, total: 0 };
      fila.count += 1;
      fila.total += v.total;
      porUsuario.set(key, fila);
    }

    // Por día, para el gráfico. Se llenan también los días sin ventas: un hueco en la línea
    // se lee como "no hay dato", y lo que pasó fue que no se vendió nada.
    const porDia = new Map<string, number>();
    for (let d = new Date(desdeFecha); d <= hastaFecha; d.setDate(d.getDate() + 1)) {
      porDia.set(d.toISOString().slice(0, 10), 0);
    }
    for (const v of actuales) {
      const dia = v.time.toISOString().slice(0, 10);
      if (porDia.has(dia)) porDia.set(dia, porDia.get(dia)! + v.total);
    }

    return {
      range,
      custom,
      desde: desdeFecha.toISOString(),
      hasta: hastaFecha.toISOString(),
      ventasCount: actuales.length,
      total: r2(total),
      costo: r2(costo),
      ganancia: r2(total - costo),
      margenPercent: total > 0 ? r2(((total - costo) / total) * 100) : 0,
      ticketPromedio: actuales.length > 0 ? r2(total / actuales.length) : 0,
      previo: {
        ventasCount: previas.length,
        total: r2(totalPrevio),
        ticketPromedio: previas.length > 0 ? r2(totalPrevio / previas.length) : 0,
      },
      // null y no 0 cuando el período anterior no tuvo ventas: no se puede decir "subió 100%"
      // desde cero, y mostrarlo como 0% haría creer que quedó igual.
      cambioPercent: totalPrevio > 0 ? r2(((total - totalPrevio) / totalPrevio) * 100) : null,
      porUsuario: [...porUsuario.values()].map((u) => ({ ...u, total: r2(u.total) })).sort((a, b) => b.total - a.total),
      porDia: [...porDia.entries()].map(([dia, monto]) => ({ dia, monto: r2(monto) })),
    };
  },

  async salesByUnit(restaurantId: string, desde?: string, hasta?: string) {
    const ventas = await prisma.shopSale.findMany({
      where: {
        restaurantId,
        returned: false,
        ...(desde || hasta
          ? { time: { ...(desde ? { gte: new Date(`${desde}T00:00:00`) } : {}), ...(hasta ? { lte: new Date(`${hasta}T23:59:59`) } : {}) } }
          : {}),
      },
      include: { items: true },
    });

    const productos = await prisma.shopProduct.findMany({
      where: { restaurantId },
      select: { id: true, name: true, category: true, saleUnit: true, cost: true },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));

    const filas = new Map<string, { categoria: string; producto: string; unidad: string; cantidad: number; ingreso: number; costo: number }>();
    for (const v of ventas) {
      for (const it of v.items) {
        const prod = it.productId ? porId.get(it.productId) : undefined;
        const categoria = it.category ?? prod?.category ?? 'Sin categoría';
        const unidad = prod?.saleUnit ?? 'UND';
        const clave = `${categoria}|${it.name}|${unidad}`;
        const actual = filas.get(clave) ?? { categoria, producto: it.name, unidad, cantidad: 0, ingreso: 0, costo: 0 };
        actual.cantidad += it.qty;
        actual.ingreso += it.qty * it.price;
        actual.costo += it.qty * it.cost;
        filas.set(clave, actual);
      }
    }

    const detalle = [...filas.values()]
      .map((f) => ({
        ...f,
        cantidad: Math.round(f.cantidad * 1000) / 1000,
        ingreso: Math.round(f.ingreso * 100) / 100,
        costo: Math.round(f.costo * 100) / 100,
        ganancia: Math.round((f.ingreso - f.costo) * 100) / 100,
      }))
      .sort((a, b) => b.ingreso - a.ingreso);

    // Totales por categoría y unidad — es la vista que responde "cuántos kg de cada manguera".
    const porCategoria = new Map<string, { categoria: string; unidad: string; cantidad: number; ingreso: number; ganancia: number }>();
    for (const d of detalle) {
      const clave = `${d.categoria}|${d.unidad}`;
      const actual = porCategoria.get(clave) ?? { categoria: d.categoria, unidad: d.unidad, cantidad: 0, ingreso: 0, ganancia: 0 };
      actual.cantidad = Math.round((actual.cantidad + d.cantidad) * 1000) / 1000;
      actual.ingreso = Math.round((actual.ingreso + d.ingreso) * 100) / 100;
      actual.ganancia = Math.round((actual.ganancia + d.ganancia) * 100) / 100;
      porCategoria.set(clave, actual);
    }

    return { categorias: [...porCategoria.values()].sort((a, b) => b.ingreso - a.ingreso), detalle };
  },

  /** Publica/despublica varios productos de una en la tienda virtual. El filtro por
   * restaurantId no es decorativo: sin él, un id de otro local publicaría su catálogo. */
  async setProductsPublished(restaurantId: string, productIds: string[], isPublished: boolean) {
    const result = await prisma.shopProduct.updateMany({
      where: { id: { in: productIds }, restaurantId },
      data: { isPublished },
    });
    return { updated: result.count, isPublished };
  },

  /**
   * Elimina un producto del inventario. El historial NO se pierde: ventas, compras y ajustes
   * guardan `productId` como texto suelto (sin FK) más un snapshot del nombre y el precio,
   * justo para que sobreviva a esto — ver el comentario en schema.prisma sobre ShopSaleItem.
   * Se van en cascada sus variantes y los insumos que consume; aparte hay que limpiar a mano
   * las recetas de OTROS productos que lo usaban como insumo, porque `supplyProductId`
   * tampoco tiene FK y quedarían apuntando a un producto que ya no existe.
   */
  async deleteProduct(restaurantId: string, id: string) {
    const existing = await prisma.shopProduct.findFirst({ where: { id, restaurantId }, select: { id: true, name: true } });
    if (!existing) throw notFound('Producto no encontrado.');

    return prisma.$transaction(async (tx) => {
      const usedAsSupply = await tx.shopServiceSupply.deleteMany({ where: { supplyProductId: id } });
      await tx.shopProduct.delete({ where: { id: existing.id } });
      return { deleted: true, name: existing.name, removedFromRecipes: usedAsSupply.count };
    });
  },

  async ensureCategory(restaurantId: string, category: string, subcategory?: string) {
    const trimmed = category.trim();
    if (trimmed) {
      await prisma.shopCategory.upsert({
        where: { restaurantId_name: { restaurantId, name: trimmed } },
        create: { restaurantId, name: trimmed },
        update: {},
      });
    }
    const trimmedSub = subcategory?.trim();
    if (trimmed && trimmedSub) {
      await prisma.shopSubcategory.upsert({
        where: { restaurantId_category_name: { restaurantId, category: trimmed, name: trimmedSub } },
        create: { restaurantId, category: trimmed, name: trimmedSub },
        update: {},
      });
    }
  },

  async addCategory(restaurantId: string, name: string) {
    await this.ensureCategory(restaurantId, name);
  },

  async addSubcategory(restaurantId: string, category: string, name: string) {
    await this.ensureCategory(restaurantId, category, name);
  },

  // --- Insumos que consume un servicio (barbería/salón) ---

  /** Reemplaza la receta completa de un servicio, igual que se reemplazan sus variantes. */
  async setServiceSupplies(restaurantId: string, serviceProductId: string, input: SetShopServiceSuppliesInput) {
    const service = await prisma.shopProduct.findFirst({ where: { id: serviceProductId, restaurantId }, select: { id: true } });
    if (!service) throw notFound('Servicio no encontrado.');

    // Los insumos tienen que ser productos del MISMO local: si no, se estaría descontando el
    // inventario de otro inquilino.
    const supplyIds = [...new Set(input.supplies.map((x) => x.supplyProductId))];
    if (supplyIds.length > 0) {
      const owned = await prisma.shopProduct.count({ where: { id: { in: supplyIds }, restaurantId } });
      if (owned !== supplyIds.length) throw badRequest('Alguno de los insumos no pertenece a este local.');
    }

    return prisma.$transaction(async (tx) => {
      await tx.shopServiceSupply.deleteMany({ where: { restaurantId, serviceProductId } });
      if (input.supplies.length > 0) {
        await tx.shopServiceSupply.createMany({
          data: input.supplies.map((x) => ({ restaurantId, serviceProductId, ...x })),
        });
      }
      return tx.shopServiceSupply.findMany({ where: { restaurantId, serviceProductId } });
    });
  },

  // --- Ventas ---

  // ─── Pedidos abiertos ────────────────────────────────────────────────────

  /**
   * Deja un carrito parado para seguirlo cargando después. Con `id` actualiza el que ya
   * existe —así el mismo pedido crece en vez de multiplicarse cada vez que se vuelve a
   * guardar— y sin `id` crea uno nuevo.
   *
   * No toca stock ni caja: mientras esté abierto no es una venta. La rebaja de existencias y
   * el asiento en caja pasan cuando se cobra, por el camino normal de recordSale.
   */
  async saveOpenOrder(
    restaurantId: string,
    userId: string,
    input: { id?: string; label: string; customerName?: string; customerPhone?: string; items: unknown[] },
  ) {
    if (!input.items.length) throw badRequest('El pedido no tiene productos.');
    const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const datos = {
      label: input.label.trim(),
      customerName: input.customerName?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      items: input.items as Prisma.InputJsonValue,
    };
    if (input.id) {
      // El where lleva restaurantId: un id ajeno no puede pisar el pedido de otro local.
      const existe = await prisma.shopOpenOrder.findFirst({ where: { id: input.id, restaurantId }, select: { id: true } });
      if (!existe) throw notFound('Ese pedido abierto ya no existe.');
      return prisma.shopOpenOrder.update({ where: { id: input.id }, data: datos });
    }
    return prisma.shopOpenOrder.create({
      data: { restaurantId, ...datos, createdByUserId: userId, createdByUserName: usuario?.name ?? null },
    });
  },

  listOpenOrders(restaurantId: string) {
    return prisma.shopOpenOrder.findMany({ where: { restaurantId }, orderBy: { updatedAt: 'desc' } });
  },

  async deleteOpenOrder(restaurantId: string, id: string) {
    const { count } = await prisma.shopOpenOrder.deleteMany({ where: { id, restaurantId } });
    if (count === 0) throw notFound('Ese pedido abierto ya no existe.');
    return { ok: true };
  },

  async recordSale(restaurantId: string, userId: string, input: CreateShopSaleInput) {
    // CRM: la venta con datos de contacto crea/actualiza al cliente en el directorio —
    // sin esto el CRM del Local se quedaba vacío aunque el POS capturara los datos.
    await customerService.upsertFromOrder(restaurantId, {
      name: input.customerName,
      phone: input.customerPhone,
    });
    // Comisión de cada profesional que aparece en el ticket, congelada al momento de vender:
    // si mañana le cambian el %, lo ya liquidado no se mueve.
    const staffIds = [...new Set(input.items.map((it) => it.staffUserId).filter((v): v is string => !!v))];
    const staff = staffIds.length
      ? await prisma.user.findMany({ where: { id: { in: staffIds }, restaurantId }, select: { id: true, commissionPercent: true } })
      : [];
    const commissionByUser = new Map(staff.map((u) => [u.id, u.commissionPercent ?? 0]));

    // CRM: con el interruptor de datos obligatorios activo, ninguna venta entra sin
    // nombre y teléfono — es lo que alimenta las listas de clientes de las promos.
    const shopConfig = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { requireCustomerData: true },
    });
    if (shopConfig.requireCustomerData && (!input.customerName?.trim() || !input.customerPhone?.trim())) {
      throw badRequest('Este negocio exige nombre y teléfono del cliente en cada venta (CRM → datos obligatorios).');
    }

    // Quién cobró: viene del JWT (req.auth.userId), nunca del cliente — así no se puede
    // reportar una venta a nombre de otro. El nombre se congela para no depender de un JOIN
    // cada vez que se lista el historial (ver ShopDashboardPage → "Ventas recientes").
    const soldBy = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const commissionFor = (it: { staffUserId?: string | null; price: number; qty: number }) => {
      if (!it.staffUserId) return null;
      const pct = commissionByUser.get(it.staffUserId) ?? 0;
      return Math.round((it.price * it.qty * (pct / 100) + Number.EPSILON) * 100) / 100;
    };

    return prisma.$transaction(async (tx) => {
      const sale = await tx.shopSale.create({
        data: {
          restaurantId,
          total: input.total,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          paymentMethod: input.paymentMethod ?? null,
          paymentMeta: input.paymentMeta ?? undefined,
          creditTerms: input.creditTerms ?? null,
          amountPaidNow: input.amountPaidNow ?? null,
          dueDate: input.creditTerms ? (input.dueDate ?? null) : null,
          soldByUserId: userId,
          soldByUserName: soldBy?.name ?? null,
          items: {
            createMany: {
              data: input.items.map((it) => ({
                productId: it.productId,
                v1: it.v1,
                v2: it.v2,
                name: it.name,
                category: it.category ?? null,
                qty: it.qty,
                price: it.price,
                cost: it.cost,
                soldByWeight: it.soldByWeight,
                detail: it.detail ?? null,
                stockQty: it.stockQty ?? null,
                staffUserId: it.staffUserId ?? null,
                commissionPercent: commissionByUser.get(it.staffUserId ?? '') ?? null,
                commissionBase: commissionFor(it),
              })),
            },
          },
        },
        include: { items: true },
      });

      // Descuenta stock de cada variante vendida (best-effort por productId+v1+v2 — si el
      // producto ya no existe o el id era temporal del frontend, la venta queda igual registrada).
      // productId viene del cliente: antes de tocar stock hay que confirmar que ese producto es
      // de ESTE restaurante — si no, un id de otro tenant (adivinado o filtrado) podría usarse
      // para descontarle/vaciarle el stock a un local ajeno sin tocar sus propios datos.
      const requestedProductIds = [...new Set(input.items.map((it) => it.productId).filter((v): v is string => !!v))];
      const ownedProducts = requestedProductIds.length
        ? await tx.shopProduct.findMany({ where: { id: { in: requestedProductIds }, restaurantId }, select: { id: true } })
        : [];
      const ownedProductIds = new Set(ownedProducts.map((p) => p.id));

      for (const item of input.items) {
        if (!item.productId || !ownedProductIds.has(item.productId)) continue;
        // stockQty manda cuando existe: en impresión de gran formato del rollo se consumen
        // metros lineales (0,80), no los m² que se le cobran al cliente (1,096).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { decrement: item.stockQty ?? item.qty } },
        });
      }
      // Insumos que consume cada servicio vendido (ej. un corte gasta 0,025 potes de cera).
      // Se descuentan del mismo inventario del local, sin que el barbero registre nada aparte.
      await applySupplyConsumption(tx, restaurantId, input.items, -1);

      // Piso en 0 (updateMany con decrement puede dejar negativo si había menos stock del esperado).
      await tx.shopProductVariant.updateMany({
        where: { productId: { in: [...ownedProductIds] }, stock: { lt: 0 } },
        data: { stock: 0 },
      });

      /**
       * Descarga de los lotes y costo de lo vendido.
       *
       * El costo que se congela en la venta es el costo POR UNIDAD que tiene el producto en ese
       * momento (Product.cost), que es el promedio ponderado y se recalcula con cada lote que
       * entra (ver recordPurchase). No se usa el costo del lote que sale: si se hiciera, vender
       * mercancía vieja daría un margen y vender la nueva otro, para el mismo producto al mismo
       * precio, y el margen que muestra el POS antes de cobrar —que sale de ese mismo promedio—
       * no coincidiría con el que queda guardado.
       *
       * Los lotes igual se descargan en orden de llegada (el más viejo primero). Eso no decide
       * el costo, decide QUÉ QUEDA: es lo que permite ver en inventario "quedan 30 Kg del lote
       * de 50 y los 54 del segundo" en vez de un único montón sin origen.
       */
      for (const item of sale.items) {
        if (!item.productId || !ownedProductIds.has(item.productId)) continue;

        // El costo lo pone el servidor, no el ticket: el POS manda el que tenía cargado en
        // pantalla, que puede haber quedado viejo si entró un lote mientras se armaba la venta.
        // Manda el de la variante cuando lo tiene (60/90/150 PSI se compran a precios muy
        // distintos); si no, el del producto, que es el caso de siempre.
        const producto = await tx.shopProduct.findUnique({
          where: { id: item.productId },
          select: { cost: true, variants: { where: { v1: item.v1, v2: item.v2 }, select: { cost: true } } },
        });
        const costoReal = producto?.variants[0]?.cost ?? producto?.cost;
        if (costoReal != null && costoReal !== item.cost) {
          await tx.shopSaleItem.update({ where: { id: item.id }, data: { cost: costoReal } });
          item.cost = costoReal;
        }

        const aConsumir = item.stockQty ?? item.qty;
        if (aConsumir <= 0) continue;

        // Solo los lotes de ESTA variante: vender una manguera de 90 PSI no puede descargar el
        // rollo de 150 que está en la misma ficha.
        const lotes = await tx.shopPurchase.findMany({
          where: { restaurantId, productId: item.productId, v1: item.v1, v2: item.v2, remainingQty: { gt: 0 } },
          orderBy: { time: 'asc' },
          select: { id: true, remainingQty: true },
        });

        let pendiente = aConsumir;
        for (const lote of lotes) {
          if (pendiente <= 0) break;
          const toma = Math.min(lote.remainingQty, pendiente);
          pendiente -= toma;
          await tx.shopPurchase.update({
            where: { id: lote.id },
            data: { remainingQty: Math.round((lote.remainingQty - toma) * 10000) / 10000 },
          });
        }
      }

      // Código de promoción (CRM): el POS ya restó el descuento del total; acá se valida el
      // código (lista, vigencia, canjes) y se registra el canje con el descuento RECALCULADO
      // sobre el total original — el monto que reclame el cliente no se toma tal cual.
      if (input.promoCode) {
        const { promotion, customerId } = await resolvePromotionForRedeem(
          tx,
          restaurantId,
          input.promoCode,
          input.customerPhone ?? null,
        );
        const originalTotal = toDecimal(input.total).add(input.promoDiscountBase ?? 0);
        const promoDiscount = promotionDiscountOf(promotion, originalTotal);
        await recordPromotionRedemption(tx, {
          restaurantId,
          promotionId: promotion.id,
          customerId,
          sourceRef: sale.id,
          amountBase: promoDiscount,
          redeemedByUserId: userId,
        });
      }

      // Cuentas bancarias: lo COBRADO ahora suma a la cuenta vinculada al método — el total
      // si la venta se pagó completa, o solo el abono inicial si quedó fiada (el resto sumará
      // con cada abono, ver addSalePayment).
      const paidNow = input.creditTerms ? (input.amountPaidNow ?? 0) : input.total;
      if (paidNow > 0) {
        await bankLedgerService.applyMethodPayment(tx, {
          restaurantId,
          method: input.paymentMethod,
          direction: 'CREDIT',
          amountBase: paidNow,
          bankAccountId: input.bankAccountId,
          description: input.customerName ? `Venta: ${input.customerName}` : 'Venta de mostrador',
          sourceRef: sale.id,
          createdByUserId: userId,
        });
      }

      return sale;
    });
  },

  async returnSale(restaurantId: string, id: string) {
    const sale = await prisma.shopSale.findFirst({ where: { id, restaurantId }, include: { items: true } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (sale.returned) throw badRequest('Esta venta ya fue devuelta.');

    return prisma.$transaction(async (tx) => {
      // Mismo chequeo de pertenencia que en recordSale — sale.items ya venía de una venta de
      // este restaurante, pero el productId que guarda cada línea es el que mandó el cliente al
      // vender, así que igual puede apuntar a un producto de otro tenant si no se validó antes.
      const requestedProductIds = [...new Set(sale.items.map((it) => it.productId).filter((v): v is string => !!v))];
      const ownedProducts = requestedProductIds.length
        ? await tx.shopProduct.findMany({ where: { id: { in: requestedProductIds }, restaurantId }, select: { id: true } })
        : [];
      const ownedProductIds = new Set(ownedProducts.map((p) => p.id));

      for (const item of sale.items) {
        if (!item.productId || !ownedProductIds.has(item.productId)) continue;
        // Se devuelve exactamente lo que se descontó al vender (ver recordSale).
        await tx.shopProductVariant.updateMany({
          where: { productId: item.productId, v1: item.v1, v2: item.v2 },
          data: { stock: { increment: item.stockQty ?? item.qty } },
        });
      }
      // Y devuelve al inventario los insumos que esos servicios habían consumido.
      await applySupplyConsumption(tx, restaurantId, sale.items, 1);

      // Cuentas bancarias: devolver una venta pagada saca del banco lo que había entrado.
      // Las fiadas no — lo abonado se ajusta a mano si aplica (caso raro).
      if (!sale.creditTerms) {
        await bankLedgerService.applyMethodPayment(tx, {
          restaurantId,
          method: sale.paymentMethod,
          direction: 'DEBIT',
          amountBase: sale.total,
          description: sale.customerName ? `Devolución venta: ${sale.customerName}` : 'Devolución de venta',
          sourceRef: sale.id,
        });
      }

      return tx.shopSale.update({ where: { id }, data: { returned: true }, include: { items: true } });
    });
  },

  // --- Compras (reponen stock) ---

  async recordPurchase(restaurantId: string, input: CreateShopPurchaseInput) {
    const product = await prisma.shopProduct.findFirst({ where: { id: input.productId, restaurantId }, include: { variants: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const variant = product.variants.find((v) => v.v1 === input.v1 && v.v2 === input.v2);
    if (!variant) throw badRequest('Variante no encontrada.');

    return prisma.$transaction(async (tx) => {
      await tx.shopProductVariant.update({ where: { id: variant.id }, data: { stock: { increment: input.qty } } });

      /**
       * Cada entrada llega con su propio costo: en Monteranch un mismo rollo pesa distinto cada
       * vez, así que lo que costó este lote no es lo que costó el anterior. El precio de venta
       * NO se toca —es el mismo siempre—, pero el costo pasa a ser el promedio ponderado de lo
       * que hay en stock.
       *
       * Ponderado y no "el último costo": con el último, vender mercancía vieja mostraría el
       * margen del lote nuevo y las ganancias saldrían mal. Cada compra queda igual guardada
       * con su costo real en ShopPurchase, así que el histórico por lote no se pierde.
       *
       * El promedio se lleva POR VARIANTE, no por producto: cuando las variantes son presiones
       * distintas de la misma manguera (60/90/150 PSI) se compran a precios muy distintos, y un
       * promedio único entre las tres daría un margen falso en las tres. El costo del producto
       * se sigue actualizando como promedio de todo, que es lo que ve un producto de una sola
       * variante y lo que usan las pantallas que resumen el inventario.
       */
      const stockPrevioVariante = variant.stock;
      const stockNuevoVariante = stockPrevioVariante + input.qty;
      if (stockNuevoVariante > 0) {
        const costoBase = variant.cost ?? product.cost;
        const costoVariante =
          Math.round(((costoBase * Math.max(0, stockPrevioVariante) + input.cost * input.qty) / stockNuevoVariante) * 10000) / 10000;
        await tx.shopProductVariant.update({ where: { id: variant.id }, data: { cost: costoVariante } });
      }

      const stockPrevio = product.variants.reduce((a, v) => a + v.stock, 0);
      const stockNuevo = stockPrevio + input.qty;
      if (stockNuevo > 0) {
        const costoPromedio =
          Math.round(((product.cost * Math.max(0, stockPrevio) + input.cost * input.qty) / stockNuevo) * 10000) / 10000;
        await tx.shopProduct.update({ where: { id: product.id }, data: { cost: costoPromedio } });
      }

      // El lote se numera por VARIANTE: "lote 2" de la de 90 PSI no tiene nada que ver con el
      // lote 2 de la de 150, son mercancías distintas que solo comparten la ficha del producto.
      const lotesPrevios = await tx.shopPurchase.count({
        where: { restaurantId, productId: product.id, v1: variant.v1, v2: variant.v2 },
      });

      return tx.shopPurchase.create({
        data: {
          restaurantId,
          supplier: input.supplier,
          productId: product.id,
          productName: product.name,
          v1: variant.v1,
          v2: variant.v2,
          qty: input.qty,
          cost: input.cost,
          weightKg: input.weightKg ?? null,
          remainingQty: input.qty,
          lotNumber: lotesPrevios + 1,
        },
      });
    });
  },

  /**
   * Lotes vivos de un producto: lo que queda de cada entrada con su costo real.
   * Es la vista que pidió Monte Ranch — "lote 1: 50 kg a $3, lote 2: 54 kg a $4,50" — en vez
   * de un único costo promedio que esconde de dónde viene la mercancía.
   */
  async productLots(restaurantId: string, productId: string) {
    const product = await prisma.shopProduct.findFirst({
      where: { id: productId, restaurantId },
      select: {
        id: true,
        name: true,
        saleUnit: true,
        price: true,
        cost: true,
        variants: { select: { id: true, v1: true, v2: true, stock: true, price: true, cost: true } },
      },
    });
    if (!product) throw notFound('Producto no encontrado.');

    const lotes = await prisma.shopPurchase.findMany({
      where: { restaurantId, productId, remainingQty: { gt: 0 } },
      orderBy: { time: 'asc' },
      select: { id: true, lotNumber: true, supplier: true, qty: true, remainingQty: true, cost: true, weightKg: true, time: true, v1: true, v2: true },
    });

    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // Los lotes se agrupan por variante: con 60/90/150 PSI en la misma ficha, mezclarlos daría
    // un montón sin origen y es justo lo que el control por lotes viene a evitar.
    const grupos = product.variants.map((v) => {
      const suyos = lotes.filter((l) => l.v1 === v.v1 && l.v2 === v.v2);
      const enLotes = suyos.reduce((a, l) => a + l.remainingQty, 0);
      const valor = suyos.reduce((a, l) => a + l.remainingQty * l.cost, 0);
      /**
       * Las entradas se agrupan por costo y peso POR UNIDAD: cinco mangueras de 56 Kg al mismo
       * precio son la misma mercancía aunque hayan llegado en dos camiones, y listarlas por
       * separado solo alarga la pantalla. Lo que de verdad distingue una carga de otra —que una
       * pesó 43 Kg y otra 56— sigue en líneas distintas, que es para lo que existe todo esto.
       *
       * El peso guardado es el de la carga completa, así que se divide entre las unidades que
       * entraron para obtener el de cada pieza; con venta por peso no aplica y queda null.
       */
      const grupos = new Map<string, { queda: number; costo: number; pesoUnitario: number | null; valor: number; cargas: number; proveedores: Set<string>; desde: Date }>();
      for (const l of suyos) {
        const pesoUnitario = l.weightKg != null && l.qty > 0 ? Math.round((l.weightKg / l.qty) * 1000) / 1000 : null;
        const clave = `${l.cost}|${pesoUnitario ?? ''}`;
        const g = grupos.get(clave) ?? { queda: 0, costo: l.cost, pesoUnitario, valor: 0, cargas: 0, proveedores: new Set<string>(), desde: l.time };
        g.queda += l.remainingQty;
        g.valor += l.remainingQty * l.cost;
        g.cargas += 1;
        g.proveedores.add(l.supplier);
        if (l.time < g.desde) g.desde = l.time;
        grupos.set(clave, g);
      }

      return {
        variante: [v.v1, v.v2].filter(Boolean).join(' / ') || 'Único',
        precio: v.price ?? product.price,
        costoActual: v.cost ?? product.cost,
        stock: r3(v.stock),
        enLotes: r3(enLotes),
        // Mercancía en stock sin entrada que la respalde: existencias cargadas antes de que
        // existiera el control por lotes, o ajustes de conteo manuales.
        sinLote: r3(v.stock - enLotes),
        valor: r2(valor),
        lotes: [...grupos.values()]
          .sort((a, b) => a.desde.getTime() - b.desde.getTime())
          .map((g) => ({
            queda: r3(g.queda),
            costo: g.costo,
            pesoKg: g.pesoUnitario,
            valor: r2(g.valor),
            // Cuántas entradas se juntaron acá: con más de una conviene decirlo, para que nadie
            // crea que llegaron todas el mismo día.
            cargas: g.cargas,
            proveedor: [...g.proveedores].join(', '),
            fecha: g.desde,
          })),
      };
    });

    const stockTotal = product.variants.reduce((a, v) => a + v.stock, 0);
    const enLotesTotal = lotes.reduce((a, l) => a + l.remainingQty, 0);
    const valorTotal = lotes.reduce((a, l) => a + l.remainingQty * l.cost, 0);

    return {
      producto: { id: product.id, nombre: product.name, unidad: product.saleUnit, precio: product.price, costoPromedio: product.cost },
      variantes: grupos,
      totales: {
        enLotes: r3(enLotesTotal),
        stock: r3(stockTotal),
        sinLote: r3(stockTotal - enLotesTotal),
        valor: r2(valorTotal),
        costoActual: product.cost,
      },
    };
  },

  // --- Ajustes de stock (fijan el valor contado) ---

  async recordAdjustment(restaurantId: string, input: CreateShopAdjustmentInput) {
    const product = await prisma.shopProduct.findFirst({ where: { id: input.productId, restaurantId }, include: { variants: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const variant = product.variants.find((v) => v.v1 === input.v1 && v.v2 === input.v2);
    if (!variant) throw badRequest('Variante no encontrada.');

    const before = variant.stock;
    return prisma.$transaction(async (tx) => {
      await tx.shopProductVariant.update({ where: { id: variant.id }, data: { stock: input.counted } });
      return tx.shopStockAdjustment.create({
        data: {
          restaurantId,
          productId: product.id,
          productName: product.name,
          v1: variant.v1,
          v2: variant.v2,
          before,
          after: input.counted,
          diff: input.counted - before,
          reason: input.reason || 'Recuento físico',
        },
      });
    });
  },

  // --- Caja ---

  async openTill(restaurantId: string, input: OpenShopTillInput) {
    const existing = await prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } });
    if (existing) throw badRequest('Ya hay una caja abierta.');
    return prisma.shopCashSession.create({ data: { restaurantId, opening: input.opening } });
  },

  async closeTill(restaurantId: string, input: CloseShopTillInput) {
    const till = await prisma.shopCashSession.findFirst({ where: { restaurantId, closedAt: null } });
    if (!till) throw badRequest('No hay una caja abierta.');

    const salesSinceOpen = await prisma.shopSale.findMany({
      where: { restaurantId, returned: false, time: { gte: till.openedAt } },
    });
    const totalSales = salesSinceOpen.reduce((a, s) => a + s.total, 0);
    const expected = till.opening + totalSales;

    return prisma.shopCashSession.update({
      where: { id: till.id },
      data: {
        closedAt: new Date(),
        salesCount: salesSinceOpen.length,
        totalSales,
        expected,
        counted: input.counted,
        diff: input.counted - expected,
      },
    });
  },

  // --- Cuentas por Cobrar (ventas fiadas: creditTerms FULL o INSTALLMENT) ---

  /** Ventas fiadas con su saldo pendiente ya calculado — solo las que aún no se saldaron. */
  async listReceivables(restaurantId: string) {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, creditTerms: { not: null }, settledAt: null },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ dueDate: 'asc' }, { time: 'asc' }],
    });
    return sales.map((s) => {
      const paid = (s.amountPaidNow ?? 0) + s.payments.reduce((a, p) => a + p.amount, 0);
      return { ...s, paid, balance: Math.max(0, round(s.total - paid)) };
    });
  },

  /** Historial completo (saldadas incluidas) — para el "estado de cuenta" de un cliente. */
  async listAllCredit(restaurantId: string) {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, creditTerms: { not: null } },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { time: 'desc' },
    });
    return sales.map((s) => {
      const paid = (s.amountPaidNow ?? 0) + s.payments.reduce((a, p) => a + p.amount, 0);
      return { ...s, paid, balance: Math.max(0, round(s.total - paid)) };
    });
  },

  /**
   * Registra un abono contra una venta fiada. Si el abono cubre todo lo que faltaba, marca
   * settledAt — de ahí en adelante la venta deja de aparecer en listReceivables().
   */
  async addSalePayment(
    restaurantId: string,
    saleId: string,
    input: { amount: number; method?: string; bankAccountId?: string | null },
  ) {
    const sale = await prisma.shopSale.findFirst({ where: { id: saleId, restaurantId }, include: { payments: true } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (!sale.creditTerms) throw badRequest('Esta venta no es una venta fiada.');
    if (sale.settledAt) throw badRequest('Esta venta ya está saldada.');

    const paidSoFar = (sale.amountPaidNow ?? 0) + sale.payments.reduce((a, p) => a + p.amount, 0);
    const balance = round(sale.total - paidSoFar);
    if (input.amount > balance + 0.01) {
      throw badRequest(`El abono no puede superar el saldo pendiente (${balance.toFixed(2)}).`);
    }

    return prisma.$transaction(async (tx) => {
      const payment = await tx.shopSalePayment.create({
        data: { shopSaleId: saleId, amount: input.amount, method: input.method },
      });
      const newBalance = round(balance - input.amount);
      if (newBalance <= 0.01) {
        await tx.shopSale.update({ where: { id: saleId }, data: { settledAt: new Date() } });
      }

      // Cuentas bancarias: el abono suma a la cuenta vinculada al método con que se cobró.
      await bankLedgerService.applyMethodPayment(tx, {
        restaurantId,
        method: input.method,
        direction: 'CREDIT',
        amountBase: input.amount,
        bankAccountId: input.bankAccountId,
        description: `Abono venta fiada${sale.customerName ? `: ${sale.customerName}` : ''}`,
        sourceRef: saleId,
      });

      return payment;
    });
  },

  async setSaleDueDate(restaurantId: string, saleId: string, dueDate: string | null) {
    const sale = await prisma.shopSale.findFirst({ where: { id: saleId, restaurantId } });
    if (!sale) throw notFound('Venta no encontrada.');
    if (!sale.creditTerms) throw badRequest('Esta venta no es una venta fiada.');
    return prisma.shopSale.update({ where: { id: saleId }, data: { dueDate } });
  },

  /**
   * Punto de equilibrio del mes: ventas y costo variable salen de `shopSalesCogsSummary`
   * (lo efectivamente vendido, no compras de inventario), combinado con los gastos fijos de
   * `movementService.summarizeFixedCosts` — ver src/utils/breakeven.ts para la fórmula
   * compartida con Restaurante y Club.
   */
  async getBreakEven(restaurantId: string, range: ReportRange, date?: string): Promise<BreakEvenResponse> {
    const dateFilter = resolveDateFilter({ range, date });
    const [{ totalRevenue, totalCost }, fixedCosts, sales] = await Promise.all([
      shopSalesCogsSummary(restaurantId, range, date),
      movementService.summarizeFixedCosts(restaurantId, range, date),
      // Ventas por día para el gráfico de acumulado contra el equilibrio.
      prisma.shopSale.findMany({
        where: { restaurantId, returned: false, time: dateFilter },
        select: { time: true, total: true },
      }),
    ]);

    const periodStart = dateFilter?.gte ?? new Date();
    const breakEven = computeBreakEven({
      salesBase: totalRevenue,
      cvBase: totalCost,
      fixedCostsBase: fixedCosts.totalBase,
      periodStart,
    });

    return {
      period: { label: monthLabel(periodStart), start: periodStart.toISOString(), end: new Date().toISOString() },
      fixedCosts,
      breakEven,
      dailySales: bucketSalesByDay(
        sales.map((s) => ({ at: s.time, amount: s.total })),
        periodStart,
        breakEven.daysElapsed,
      ),
    };
  },
};

/**
 * Ventas y costo variable de lo efectivamente vendido en el período (excluye devueltas). El
 * ingreso es `ShopSale.total` (ya neto de descuentos/promos — el POS lo resta antes de crear
 * la venta), y el costo variable es `cost * qty` sumado de todas las líneas — nunca compras de
 * inventario, que no reflejan lo que realmente se vendió. Exportada porque Club reutiliza esto
 * mismo para su propia tienda (ver club-stats.service.ts#breakEven).
 */
export async function shopSalesCogsSummary(restaurantId: string, range: ReportRange, date?: string) {
  const sales = await prisma.shopSale.findMany({
    where: { restaurantId, returned: false, time: resolveDateFilter({ range, date }) },
    select: { total: true, items: { select: { cost: true, qty: true } } },
  });

  const totalRevenue = sales.reduce((acc, s) => acc.add(toDecimal(s.total)), toDecimal(0));
  const totalCost = sales.reduce(
    (acc, s) => acc.add(s.items.reduce((itemAcc, it) => itemAcc.add(toDecimal(it.cost).mul(it.qty)), toDecimal(0))),
    toDecimal(0),
  );

  return { totalRevenue: round2(totalRevenue), totalCost: round2(totalCost) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
