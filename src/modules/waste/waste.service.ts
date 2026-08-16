import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { describeDateSpec, resolveDateFilter, type DateSpec } from '../../utils/date-range';
import { startOfDayCaracas } from '../../utils/timezone';
import { buildCostGraph, resolveCostPerBaseUnit } from '../inventory/costing';
import { resolveInventoryScope } from '../inventory/inventory-scope';
import { CreateWasteInput } from './waste.dto';

/**
 * Merma: lo que se perdió y no se vendió. Dos preguntas que responde este módulo:
 *
 *  - ¿CUÁNTO estoy perdiendo? → indicador general: costo de la merma del período, su peso
 *    sobre el costo de ventas y sobre las ventas, y el contraste contra el % de merma que el
 *    dueño asumió en su estructura de costo (si estimó 3 % y la real es 7 %, cada plato está
 *    mal costeado).
 *  - ¿DÓNDE la estoy perdiendo? → indicador por producto/insumo: ranking por costo perdido,
 *    con la merma en unidades comparada contra lo vendido en el mismo período.
 *
 * El costo de cada merma se congela al registrarla (mismo criterio que OrderItem.unitPrice):
 * el costo vivo del insumo sale del grafo de costeo de las recetas, el del producto de su
 * receta o su costo manual.
 */

const D = (n: Prisma.Decimal | number | null | undefined) => toDecimal(n ?? 0);
const pct = (part: Prisma.Decimal, base: Prisma.Decimal) => (base.gt(0) ? round2(part.div(base).mul(100)).toFixed(1) : null);

/** Costo vivo de UNA unidad del producto: suma de su receta, o su costo manual. */
async function productUnitCost(restaurantId: string, productId: string) {
  const [product, recipe] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: { id: true, name: true, costSource: true, costBase: true, stockControlEnabled: true, stockQuantity: true },
    }),
    prisma.recipeIngredient.aggregate({ where: { restaurantId, productId }, _sum: { costBase: true } }),
  ]);
  if (!product) throw notFound('Producto no encontrado.');
  const unitCost = product.costSource === 'RECIPE' ? D(recipe._sum.costBase) : D(product.costBase);
  return { product, unitCost };
}

export const wasteService = {
  async create(restaurantId: string, userId: string | undefined, input: CreateWasteInput) {
    const occurredAt = input.occurredAt ? startOfDayCaracas(input.occurredAt) : new Date();
    // Nombre congelado (igual que Movement.spentByName): si mañana borran al usuario, el
    // histórico de merma sigue diciendo quién la cargó.
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    const quantity = toDecimal(input.quantity);

    if (input.productId) {
      const { product, unitCost } = await productUnitCost(restaurantId, input.productId);
      const costBase = round2(unitCost.mul(quantity));
      // El control de stock por producto es entero (unidades vendibles); si no lo usa, no
      // hay existencia que descontar y se registra igual (solo el costo perdido).
      const adjust = input.adjustStock && product.stockControlEnabled && product.stockQuantity != null;
      return prisma.$transaction(async (tx) => {
        if (adjust) {
          const next = Math.max(0, (product.stockQuantity ?? 0) - Math.ceil(Number(quantity)));
          await tx.product.update({ where: { id: product.id }, data: { stockQuantity: next } });
        }
        return tx.wasteRecord.create({
          data: {
            restaurantId,
            productId: product.id,
            itemName: product.name,
            unit: 'und',
            quantity,
            costBase,
            reason: input.reason,
            note: input.note,
            stockAdjusted: !!adjust,
            createdByUserId: userId,
            createdByName: user?.name,
            occurredAt,
          },
        });
      });
    }

    // --- Insumo del inventario ---
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { parentRestaurantId: true } });
    const scopeId = await resolveInventoryScope(restaurantId, restaurant?.parentRestaurantId);
    const item = await prisma.inventoryItem.findFirst({
      where: { id: input.inventoryItemId!, restaurantId: scopeId },
      select: { id: true, name: true, unit: true, quantity: true },
    });
    if (!item) throw badRequest('El insumo no existe o no pertenece a este restaurante.');

    const graph = await buildCostGraph(prisma, scopeId);
    const costBase = round2(resolveCostPerBaseUnit(graph, { inventoryItemId: item.id }).mul(quantity));

    return prisma.$transaction(async (tx) => {
      if (input.adjustStock) {
        // Nunca baja de 0: una merma mal cargada no debe dejar existencia negativa.
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: Prisma.Decimal.max(0, D(item.quantity).sub(quantity)) },
        });
      }
      return tx.wasteRecord.create({
        data: {
          restaurantId,
          inventoryItemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity,
          costBase,
          reason: input.reason,
          note: input.note,
          stockAdjusted: !!input.adjustStock,
          createdByUserId: userId,
          createdByName: user?.name,
          occurredAt,
        },
      });
    });
  },

  async list(restaurantId: string, spec: DateSpec) {
    const rows = await prisma.wasteRecord.findMany({
      where: { restaurantId, occurredAt: resolveDateFilter(spec) },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.productId ? ('PRODUCT' as const) : ('INVENTORY' as const),
      inventoryItemId: r.inventoryItemId,
      productId: r.productId,
      itemName: r.itemName,
      unit: r.unit,
      quantity: r.quantity.toFixed(3),
      costBase: r.costBase.toFixed(2),
      reason: r.reason,
      note: r.note,
      stockAdjusted: r.stockAdjusted,
      createdByName: r.createdByName,
      occurredAt: r.occurredAt,
    }));
  },

  /** Borra un registro cargado por error. No devuelve la existencia descontada a propósito:
   * el stock se corrige con un ajuste de inventario, que deja su propio rastro. */
  async remove(restaurantId: string, id: string) {
    const existing = await prisma.wasteRecord.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Registro de merma no encontrado.');
    await prisma.wasteRecord.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * Indicadores de merma del período: el general (cuánto pesa) y el detalle por producto e
   * insumo (dónde se pierde). `soldUnits` permite leer la merma de un producto contra lo que
   * de verdad se vendió: 5 unidades botadas son otra cosa si vendiste 20 que si vendiste 500.
   */
  async stats(restaurantId: string, spec: DateSpec) {
    const occurredAt = resolveDateFilter(spec);
    const createdAt = occurredAt;

    const [records, orderItems, products, recipeSums, sales, config] = await Promise.all([
      prisma.wasteRecord.findMany({
        where: { restaurantId, occurredAt },
        select: { productId: true, inventoryItemId: true, itemName: true, unit: true, quantity: true, costBase: true, reason: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt } },
        select: { productId: true, quantity: true },
      }),
      prisma.product.findMany({ where: { restaurantId }, select: { id: true, costSource: true, costBase: true, name: true } }),
      prisma.recipeIngredient.groupBy({ by: ['productId'], where: { restaurantId }, _sum: { costBase: true } }),
      prisma.order.aggregate({ where: { restaurantId, status: { not: 'CANCELLED' }, createdAt }, _sum: { subtotalBase: true } }),
      prisma.costStructureConfig.findUnique({ where: { restaurantId }, select: { items: true } }),
    ]);

    // Costo de ventas del período (mismo criterio que Contabilidad y el KPI de food cost).
    const recipeCost = new Map(recipeSums.map((r) => [r.productId, D(r._sum.costBase)]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const unitCostOf = (id: string | null) => {
      const p = id ? productById.get(id) : undefined;
      if (!p) return toDecimal(0);
      return p.costSource === 'RECIPE' ? (recipeCost.get(p.id) ?? toDecimal(0)) : D(p.costBase);
    };
    let costOfSales = toDecimal(0);
    const soldUnits = new Map<string, number>();
    for (const it of orderItems) {
      costOfSales = costOfSales.add(unitCostOf(it.productId).mul(it.quantity));
      if (it.productId) soldUnits.set(it.productId, (soldUnits.get(it.productId) ?? 0) + it.quantity);
    }
    costOfSales = round2(costOfSales);
    const salesBase = round2(D(sales._sum.subtotalBase));

    // --- Totales y desglose por motivo ---
    const totalCost = round2(records.reduce((a, r) => a.add(r.costBase), toDecimal(0)));
    const byReasonMap = new Map<string, { costBase: Prisma.Decimal; count: number }>();
    for (const r of records) {
      const cur = byReasonMap.get(r.reason) ?? { costBase: toDecimal(0), count: 0 };
      byReasonMap.set(r.reason, { costBase: cur.costBase.add(r.costBase), count: cur.count + 1 });
    }
    const byReason = [...byReasonMap.entries()]
      .map(([reason, v]) => ({ reason, costBase: round2(v.costBase).toFixed(2), count: v.count, sharePercent: pct(v.costBase, totalCost) }))
      .sort((a, b) => Number(b.costBase) - Number(a.costBase));

    // --- Por producto / insumo ---
    type Row = { key: string; kind: 'PRODUCT' | 'INVENTORY'; id: string | null; name: string; unit: string; quantity: Prisma.Decimal; costBase: Prisma.Decimal; count: number };
    const rowsMap = new Map<string, Row>();
    for (const r of records) {
      const kind: 'PRODUCT' | 'INVENTORY' = r.productId ? 'PRODUCT' : 'INVENTORY';
      const id = r.productId ?? r.inventoryItemId;
      const key = `${kind}:${id ?? r.itemName}`;
      const cur = rowsMap.get(key) ?? { key, kind, id, name: r.itemName, unit: r.unit, quantity: toDecimal(0), costBase: toDecimal(0), count: 0 };
      cur.quantity = cur.quantity.add(r.quantity);
      cur.costBase = cur.costBase.add(r.costBase);
      cur.count += 1;
      rowsMap.set(key, cur);
    }
    const rows = [...rowsMap.values()]
      .map((r) => {
        const sold = r.kind === 'PRODUCT' && r.id ? (soldUnits.get(r.id) ?? 0) : null;
        const wasted = Number(round2(r.quantity));
        return {
          kind: r.kind,
          id: r.id,
          name: r.name,
          unit: r.unit,
          quantity: round2(r.quantity).toFixed(3),
          costBase: round2(r.costBase).toFixed(2),
          records: r.count,
          sharePercent: pct(r.costBase, totalCost),
          soldUnits: sold,
          // Merma sobre lo movido: perdido ÷ (perdido + vendido). Solo para productos, que son
          // los únicos con unidades vendidas comparables.
          wastePercent: sold != null && sold + wasted > 0 ? round2(toDecimal(wasted).div(sold + wasted).mul(100)).toFixed(1) : null,
        };
      })
      .sort((a, b) => Number(b.costBase) - Number(a.costBase));

    // --- Contraste con el % de merma asumido en la estructura de costo ---
    const items = Array.isArray(config?.items) ? (config!.items as unknown as { id: string; kind: string; percent: number; enabled: boolean }[]) : [];
    const budgeted = items.find((i) => i.id === 'waste' && i.enabled);
    const budgetedPercent = budgeted ? Number(budgeted.percent) : null;
    // El % presupuestado está sobre el PRECIO de venta; para comparar manzanas con manzanas
    // el real también se mide sobre las ventas del período.
    const realOnSales = pct(totalCost, salesBase);

    return {
      period: { label: describeDateSpec(spec), ...spec },
      total: {
        costBase: totalCost.toFixed(2),
        records: records.length,
        percentOfCostOfSales: pct(totalCost, costOfSales),
        percentOfSales: realOnSales,
        costOfSalesBase: costOfSales.toFixed(2),
        salesBase: salesBase.toFixed(2),
      },
      budget: {
        percent: budgetedPercent != null ? budgetedPercent.toFixed(2) : null,
        realPercent: realOnSales,
        // true = la merma real se pasó de lo presupuestado en la estructura de costo.
        overBudget: budgetedPercent != null && realOnSales != null ? Number(realOnSales) > budgetedPercent : null,
      },
      byReason,
      rows,
    };
  },
};
