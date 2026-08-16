import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { resolveDateFilter, ReportRange } from '../../utils/date-range';
import {
  computeCostStructure,
  DEFAULT_COST_STRUCTURE_ITEMS,
  sumPercent,
  type CostStructureItem,
  type MaterialLine,
} from '../../utils/cost-structure';
import { SaveProductCostStructureInput, UpdateCostStructureConfigInput } from './cost-structure.dto';
import { buildCostGraph, resolveCostPerBaseUnit } from '../inventory/costing';
import { resolveInventoryScope } from '../inventory/inventory-scope';

const configSelect = { id: true, items: true, targetNetMarginPercent: true, updatedAt: true } as const;

function serializeConfig(row: { items: Prisma.JsonValue; targetNetMarginPercent: Prisma.Decimal; updatedAt: Date }) {
  return {
    items: (Array.isArray(row.items) ? row.items : []) as unknown as CostStructureItem[],
    targetNetMarginPercent: Number(row.targetNetMarginPercent),
    updatedAt: row.updatedAt,
  };
}

/** Sanea líneas de material y calcula el total (cantidad × costo unitario) por línea. */
function normalizeMaterials(materials: MaterialLine[]) {
  return materials.map((m) => ({
    name: m.name,
    quantity: Number(m.quantity) || 0,
    unit: m.unit || 'und',
    unitCost: Number(m.unitCost) || 0,
    totalCost: round2(toDecimal((Number(m.quantity) || 0) * (Number(m.unitCost) || 0))).toNumber(),
    inventoryItemId: m.inventoryItemId ?? null,
    preparationId: m.preparationId ?? null,
  }));
}

export const costStructureService = {
  /** Config del restaurante; la crea con los elementos fundamentales si todavía no existe. */
  async getConfig(restaurantId: string) {
    const existing = await prisma.costStructureConfig.findUnique({ where: { restaurantId }, select: configSelect });
    if (existing) return serializeConfig(existing);
    const created = await prisma.costStructureConfig.create({
      data: { restaurantId, items: DEFAULT_COST_STRUCTURE_ITEMS as unknown as Prisma.InputJsonValue },
      select: configSelect,
    });
    return serializeConfig(created);
  },

  async updateConfig(restaurantId: string, input: UpdateCostStructureConfigInput) {
    const ids = new Set<string>();
    for (const item of input.items) {
      if (ids.has(item.id)) throw badRequest('Hay dos elementos con el mismo identificador.');
      ids.add(item.id);
    }
    const overhead = sumPercent(input.items, 'FIXED') + sumPercent(input.items, 'VARIABLE');
    if (overhead >= 100) {
      throw badRequest('La suma de porcentajes fijos y variables no puede llegar al 100 % del precio: no quedaría nada para la materia prima.');
    }
    const row = await prisma.costStructureConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        items: input.items as unknown as Prisma.InputJsonValue,
        targetNetMarginPercent: input.targetNetMarginPercent,
      },
      update: { items: input.items as unknown as Prisma.InputJsonValue, targetNetMarginPercent: input.targetNetMarginPercent },
      select: configSelect,
    });
    return serializeConfig(row);
  },

  /**
   * % de costo fijo real del período: gastos marcados como recurrentes ÷ ventas del mismo
   * período. Es la sugerencia para el % fijo total de la config — el dueño decide si la
   * adopta. Sin ventas no hay porcentaje que sugerir (se avisa en vez de dividir por cero).
   */
  async suggestFixedPercent(restaurantId: string, range: ReportRange) {
    const createdAt = resolveDateFilter({ range });
    const [fixed, sales] = await Promise.all([
      prisma.movement.aggregate({
        where: { restaurantId, type: 'EXPENSE', isRecurring: true, createdAt },
        _sum: { amountBase: true },
      }),
      prisma.order.aggregate({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt },
        _sum: { subtotalBase: true },
      }),
    ]);
    const fixedBase = toDecimal(fixed._sum.amountBase ?? 0);
    const salesBase = toDecimal(sales._sum.subtotalBase ?? 0);
    const percent = salesBase.gt(0) ? round2(fixedBase.div(salesBase).mul(100)) : null;
    return {
      range,
      fixedCostsBase: round2(fixedBase).toFixed(2),
      salesBase: round2(salesBase).toFixed(2),
      suggestedFixedPercent: percent ? percent.toFixed(2) : null,
    };
  },

  /**
   * Insumos y preparaciones disponibles para "Tomar de insumo" en la calculadora, cada uno
   * con su costo por unidad base según el MISMO grafo de costeo que usan las recetas
   * (precio por unidad × corrección ÷ rendimiento; las preparaciones se resuelven en cascada).
   * Sucursales con inventario compartido leen los insumos de la casa matriz.
   */
  async listMaterials(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { parentRestaurantId: true } });
    const scopeId = await resolveInventoryScope(restaurantId, restaurant?.parentRestaurantId);
    const [graph, items, preparations] = await Promise.all([
      buildCostGraph(prisma, scopeId),
      prisma.inventoryItem.findMany({
        where: { restaurantId: scopeId, locationScope: 'LOCAL' },
        select: { id: true, name: true, unit: true, category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.preparation.findMany({ where: { restaurantId: scopeId }, select: { id: true, name: true, unit: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        categoryName: i.category?.name ?? null,
        unitCost: round2(resolveCostPerBaseUnit(graph, { inventoryItemId: i.id })).toNumber(),
      })),
      preparations: preparations.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        unitCost: round2(resolveCostPerBaseUnit(graph, { preparationId: p.id })).toNumber(),
      })),
    };
  },

  /**
   * Ficha de un producto para la calculadora: precio actual, materiales de arranque y la
   * estructura guardada (si existe). El material sale, en este orden, de: la estructura
   * guardada → la receta (costSource RECIPE) → una sola línea con el costo manual.
   */
  async getProduct(restaurantId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: {
        id: true,
        name: true,
        price: true,
        costSource: true,
        costBase: true,
        category: { select: { name: true } },
        costStructure: true,
        recipeIngredients: {
          select: {
            quantity: true,
            costBase: true,
            inventoryItem: { select: { id: true, name: true, unit: true } },
            preparation: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });
    if (!product) throw notFound('Producto no encontrado.');

    let materials: ReturnType<typeof normalizeMaterials>;
    let materialsSource: 'SAVED' | 'RECIPE' | 'MANUAL' | 'EMPTY';
    if (product.costStructure) {
      materials = normalizeMaterials((product.costStructure.materials as unknown as MaterialLine[]) ?? []);
      materialsSource = 'SAVED';
    } else if (product.costSource === 'RECIPE' && product.recipeIngredients.length > 0) {
      materials = normalizeMaterials(
        product.recipeIngredients.map((l) => {
          const qty = Number(l.quantity);
          const cost = Number(l.costBase);
          return {
            name: l.inventoryItem?.name ?? l.preparation?.name ?? 'Ingrediente',
            quantity: qty,
            unit: l.inventoryItem?.unit ?? l.preparation?.unit ?? 'und',
            unitCost: qty > 0 ? cost / qty : cost,
            inventoryItemId: l.inventoryItem?.id ?? null,
            preparationId: l.preparation?.id ?? null,
          };
        }),
      );
      materialsSource = 'RECIPE';
    } else if (product.costBase && Number(product.costBase) > 0) {
      materials = normalizeMaterials([{ name: 'Costo del producto (manual)', quantity: 1, unit: 'und', unitCost: Number(product.costBase) }]);
      materialsSource = 'MANUAL';
    } else {
      materials = [];
      materialsSource = 'EMPTY';
    }

    const saved = product.costStructure;
    return {
      product: {
        id: product.id,
        name: product.name,
        categoryName: product.category.name,
        price: Number(product.price),
        costSource: product.costSource,
        costBase: product.costBase != null ? Number(product.costBase) : null,
      },
      materials,
      materialsSource,
      saved: saved
        ? {
            salePriceBase: Number(saved.salePriceBase),
            materialsCostBase: Number(saved.materialsCostBase),
            variablePercent: Number(saved.variablePercent),
            fixedPercent: Number(saved.fixedPercent),
            totalCostBase: Number(saved.totalCostBase),
            netProfitBase: Number(saved.netProfitBase),
            netMarginPercent: Number(saved.netMarginPercent),
            updatedAt: saved.updatedAt,
          }
        : null,
    };
  },

  /** Guarda el snapshot del producto recalculando TODO en el servidor a partir de los inputs. */
  async saveProduct(restaurantId: string, productId: string, input: SaveProductCostStructureInput) {
    const product = await prisma.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true, costSource: true } });
    if (!product) throw notFound('Producto no encontrado.');
    const config = await this.getConfig(restaurantId);
    const materials = normalizeMaterials(input.materials as MaterialLine[]);
    const result = computeCostStructure({
      salePrice: input.salePriceBase,
      materials,
      items: config.items,
      targetNetMarginPercent: config.targetNetMarginPercent,
    });

    const data = {
      materials: materials as unknown as Prisma.InputJsonValue,
      materialsCostBase: result.materialsCost,
      variablePercent: result.variablePercent,
      fixedPercent: result.fixedPercent,
      salePriceBase: input.salePriceBase,
      variableCostBase: result.variableCost,
      fixedCostBase: result.fixedCost,
      totalCostBase: result.totalCost,
      netProfitBase: result.netProfit,
      netMarginPercent: result.netMarginPercent,
    };

    await prisma.$transaction(async (tx) => {
      await tx.productCostStructure.upsert({
        where: { productId },
        create: { restaurantId, productId, ...data },
        update: data,
      });
      // Solo con costo manual: con receta el costo vive en las líneas de receta y lo manda
      // el inventario, no la calculadora.
      if (input.syncProductCost && product.costSource === 'MANUAL') {
        await tx.product.update({ where: { id: productId }, data: { costBase: result.materialsCost } });
      }
    });

    return this.getProduct(restaurantId, productId);
  },

  async removeProduct(restaurantId: string, productId: string) {
    const existing = await prisma.productCostStructure.findFirst({ where: { productId, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Este producto no tiene estructura guardada.');
    await prisma.productCostStructure.delete({ where: { id: existing.id } });
    return { deleted: true };
  },

  /**
   * Estadísticas de estructura de costo:
   *  - cobertura: cuántos productos activos tienen estructura guardada;
   *  - composición promedio (simple) de las estructuras guardadas: MP / variables / fijos / utilidad;
   *  - estructura REAL del período, ponderada por lo vendido: ventas, MP (costo vivo del
   *    producto × cantidad), variables (Σ % × ventas), fijos (gastos recurrentes reales del
   *    período — no el %, lo que de verdad se pagó) y utilidad neta resultante;
   *  - ranking de productos por margen neto guardado, y los que quedan bajo el objetivo.
   */
  async getStats(restaurantId: string, range: ReportRange) {
    const config = await this.getConfig(restaurantId);
    const createdAt = resolveDateFilter({ range });
    const [structures, productCount, items, products, recipeSums, fixed] = await Promise.all([
      prisma.productCostStructure.findMany({
        where: { restaurantId },
        select: {
          productId: true,
          materialsCostBase: true,
          variableCostBase: true,
          fixedCostBase: true,
          salePriceBase: true,
          netProfitBase: true,
          netMarginPercent: true,
          updatedAt: true,
          product: { select: { name: true, price: true, category: { select: { name: true } } } },
        },
      }),
      prisma.product.count({ where: { restaurantId, isAvailable: true } }),
      prisma.orderItem.findMany({
        where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt } },
        select: { productId: true, quantity: true, lineTotal: true },
      }),
      prisma.product.findMany({ where: { restaurantId }, select: { id: true, costSource: true, costBase: true } }),
      prisma.recipeIngredient.groupBy({ by: ['productId'], where: { restaurantId }, _sum: { costBase: true } }),
      prisma.movement.aggregate({ where: { restaurantId, type: 'EXPENSE', isRecurring: true, createdAt }, _sum: { amountBase: true } }),
    ]);

    // --- Composición promedio de las estructuras guardadas (share sobre el precio) ---
    const shares = structures
      .filter((s) => Number(s.salePriceBase) > 0)
      .map((s) => {
        const price = Number(s.salePriceBase);
        return {
          materials: (Number(s.materialsCostBase) / price) * 100,
          variable: (Number(s.variableCostBase) / price) * 100,
          fixed: (Number(s.fixedCostBase) / price) * 100,
          profit: (Number(s.netProfitBase) / price) * 100,
        };
      });
    const avg = (pick: (s: (typeof shares)[number]) => number) =>
      shares.length ? round2(toDecimal(shares.reduce((acc, s) => acc + pick(s), 0) / shares.length)).toFixed(1) : null;
    const averageComposition = {
      materialsPercent: avg((s) => s.materials),
      variablePercent: avg((s) => s.variable),
      fixedPercent: avg((s) => s.fixed),
      profitPercent: avg((s) => s.profit),
    };

    // --- Estructura real del período ---
    const recipeCostByProduct = new Map(recipeSums.map((r) => [r.productId, toDecimal(r._sum.costBase ?? 0)]));
    const productById = new Map(products.map((p) => [p.id, p]));
    let salesBase = toDecimal(0);
    let materialsBase = toDecimal(0);
    for (const it of items) {
      salesBase = salesBase.add(it.lineTotal);
      const p = it.productId ? productById.get(it.productId) : undefined;
      if (!p) continue;
      const unit = p.costSource === 'RECIPE' ? (recipeCostByProduct.get(p.id) ?? toDecimal(0)) : toDecimal(p.costBase ?? 0);
      materialsBase = materialsBase.add(unit.mul(it.quantity));
    }
    const variablePercent = sumPercent(config.items, 'VARIABLE');
    const variableBase = round2(salesBase.mul(variablePercent).div(100));
    const fixedBase = round2(toDecimal(fixed._sum.amountBase ?? 0));
    const netBase = round2(salesBase.sub(materialsBase).sub(variableBase).sub(fixedBase));
    const pct = (part: Prisma.Decimal) => (salesBase.gt(0) ? round2(part.div(salesBase).mul(100)).toFixed(1) : null);
    const period = {
      range,
      salesBase: round2(salesBase).toFixed(2),
      materialsBase: round2(materialsBase).toFixed(2),
      variableBase: variableBase.toFixed(2),
      fixedBase: fixedBase.toFixed(2),
      netBase: netBase.toFixed(2),
      materialsPercent: pct(materialsBase),
      variablePercent: pct(variableBase),
      fixedPercent: pct(fixedBase),
      netPercent: pct(netBase),
      /** % fijo real vs. el % fijo configurado: la brecha que la sugerencia automática cierra. */
      configuredFixedPercent: sumPercent(config.items, 'FIXED').toFixed(2),
      configuredVariablePercent: variablePercent.toFixed(2),
    };

    // --- Ranking y alertas ---
    const target = config.targetNetMarginPercent;
    const rows = structures
      .map((s) => ({
        productId: s.productId,
        name: s.product.name,
        categoryName: s.product.category.name,
        salePriceBase: Number(s.salePriceBase).toFixed(2),
        currentPrice: Number(s.product.price).toFixed(2),
        priceChanged: Number(s.product.price) !== Number(s.salePriceBase),
        materialsCostBase: Number(s.materialsCostBase).toFixed(2),
        totalCostBase: round2(toDecimal(Number(s.materialsCostBase) + Number(s.variableCostBase) + Number(s.fixedCostBase))).toFixed(2),
        netProfitBase: Number(s.netProfitBase).toFixed(2),
        netMarginPercent: Number(s.netMarginPercent).toFixed(1),
        belowTarget: Number(s.netMarginPercent) < target,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => Number(b.netMarginPercent) - Number(a.netMarginPercent));

    return {
      targetNetMarginPercent: target,
      coverage: { withStructure: structures.length, activeProducts: productCount },
      averageComposition,
      period,
      rows,
      belowTargetCount: rows.filter((r) => r.belowTarget).length,
    };
  },
};
