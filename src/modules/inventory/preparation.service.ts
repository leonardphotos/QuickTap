import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreatePreparationIngredientInput, CreatePreparationInput, UpdatePreparationIngredientInput, UpdatePreparationInput } from './preparation.dto';
import { buildCostGraph, recomputeDependentCosts, resolveCostPerBaseUnit } from './costing';

const UNIT_LABELS: Record<string, string> = { kg: 'Kg', lt: 'Lt' };

/** ¿`candidateId` aparece en la cadena de ingredientes de `preparationId` (directa o
 * anidada)? Usado para bloquear ciclos ANTES de guardar (costing.ts solo se protege
 * a sí mismo con un `seen` set, pero preferimos no permitir guardar el ciclo). */
function wouldCreateCycle(graph: Awaited<ReturnType<typeof buildCostGraph>>, preparationId: string, candidateId: string): boolean {
  if (preparationId === candidateId) return true;
  const seen = new Set<string>();
  function visit(id: string): boolean {
    if (id === preparationId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const prep = graph.preparations.get(id);
    if (!prep) return false;
    return prep.ingredients.some((ing) => (ing.preparationId ? visit(ing.preparationId) : false));
  }
  return visit(candidateId);
}

/** Preparaciones (sub-recetas): bases intermedias reutilizables entre platos, armadas a
 * partir de insumos y/o de otras preparaciones. Solo Premium (mismo `inventoryRecipe`
 * que Recetas) — ver preparation.routes en inventory.routes.ts. */
export const preparationService = {
  async listOverview(restaurantId: string) {
    const [preparations, ingredients] = await Promise.all([
      prisma.preparation.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } }),
      prisma.preparationIngredient.findMany({ where: { restaurantId }, select: { preparationId: true, costBase: true } }),
    ]);

    const totalByPrep = new Map<string, { count: number; total: Prisma.Decimal }>();
    for (const ing of ingredients) {
      const entry = totalByPrep.get(ing.preparationId);
      if (entry) {
        entry.count += 1;
        entry.total = entry.total.add(ing.costBase);
      } else {
        totalByPrep.set(ing.preparationId, { count: 1, total: toDecimal(ing.costBase) });
      }
    }

    return preparations.map((p) => {
      const entry = totalByPrep.get(p.id);
      const totalCostBase = entry?.total ?? toDecimal(0);
      // yieldQuantity está en la misma unidad declarada de la preparación (kg/lt) — mismo
      // criterio que RecipeIngredient.quantity para insumos — así que dividir da directo el
      // costo por 1 kg/lt, sin factor de escala.
      const costPerBaseUnit = p.yieldQuantity.greaterThan(0) ? totalCostBase.div(p.yieldQuantity) : toDecimal(0);
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        unitLabel: UNIT_LABELS[p.unit] ?? p.unit,
        yieldQuantity: p.yieldQuantity.toFixed(3),
        ingredientCount: entry?.count ?? 0,
        totalCostBase: round2(totalCostBase).toFixed(2),
        costPerBaseUnit: round2(costPerBaseUnit).toFixed(4),
      };
    });
  },

  async getById(restaurantId: string, id: string) {
    const preparation = await prisma.preparation.findFirst({ where: { id, restaurantId } });
    if (!preparation) throw notFound('Preparación no encontrada.');

    const lines = await prisma.preparationIngredient.findMany({
      where: { restaurantId, preparationId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true } },
        componentPreparation: { select: { id: true, name: true, unit: true } },
      },
    });

    const totalCostBase = round2(lines.reduce((acc, l) => acc.add(l.costBase), toDecimal(0)));
    // Misma unidad declarada de la preparación (kg/lt) — sin factor de escala, ver listOverview.
    const costPerBaseUnit = preparation.yieldQuantity.greaterThan(0) ? totalCostBase.div(preparation.yieldQuantity) : toDecimal(0);

    return {
      id: preparation.id,
      name: preparation.name,
      unit: preparation.unit,
      yieldQuantity: preparation.yieldQuantity.toFixed(3),
      totalCostBase: totalCostBase.toFixed(2),
      costPerBaseUnit: round2(costPerBaseUnit).toFixed(4),
      ingredients: lines.map((l) => ({
        id: l.id,
        type: l.inventoryItemId ? ('insumo' as const) : ('preparacion' as const),
        inventoryItemId: l.inventoryItemId,
        componentPreparationId: l.componentPreparationId,
        name: l.inventoryItem?.name ?? l.componentPreparation?.name ?? '',
        unit: l.inventoryItem?.unit ?? l.componentPreparation?.unit ?? '',
        quantity: l.quantity.toFixed(3),
        costBase: l.costBase.toFixed(4),
      })),
    };
  },

  async create(restaurantId: string, input: CreatePreparationInput) {
    return prisma.preparation.create({
      data: { restaurantId, name: input.name, unit: input.unit, yieldQuantity: input.yieldQuantity },
    });
  },

  async update(restaurantId: string, id: string, input: UpdatePreparationInput) {
    const existing = await prisma.preparation.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Preparación no encontrada.');

    const yieldChanged = input.yieldQuantity !== undefined && !toDecimal(input.yieldQuantity).equals(existing.yieldQuantity);

    return prisma.$transaction(async (tx) => {
      const preparation = await tx.preparation.update({ where: { id }, data: input });
      if (yieldChanged) await recomputeDependentCosts(tx, restaurantId);
      return preparation;
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.preparation.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Preparación no encontrada.');

    const [usedInPrep, usedInRecipe] = await Promise.all([
      prisma.preparationIngredient.findFirst({ where: { restaurantId, componentPreparationId: id } }),
      prisma.recipeIngredient.findFirst({ where: { restaurantId, preparationId: id } }),
    ]);
    if (usedInPrep || usedInRecipe) {
      throw conflict('Esta preparación está en uso como ingrediente de otra preparación o receta. Quítala de ahí primero.');
    }

    await prisma.preparation.delete({ where: { id } });
    return { deleted: true };
  },

  async addIngredient(restaurantId: string, preparationId: string, input: CreatePreparationIngredientInput) {
    const preparation = await prisma.preparation.findFirst({ where: { id: preparationId, restaurantId } });
    if (!preparation) throw notFound('Preparación no encontrada.');

    if (input.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
      if (!item) throw badRequest('El insumo elegido no existe.');
    } else if (input.componentPreparationId) {
      const component = await prisma.preparation.findFirst({ where: { id: input.componentPreparationId, restaurantId } });
      if (!component) throw badRequest('La preparación elegida no existe.');
      const graph = await buildCostGraph(prisma, restaurantId);
      if (wouldCreateCycle(graph, preparationId, input.componentPreparationId)) {
        throw badRequest('Esa preparación ya depende de esta — no se puede armar un ciclo.');
      }
    }

    return prisma.$transaction(async (tx) => {
      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = resolveCostPerBaseUnit(graph, { inventoryItemId: input.inventoryItemId, preparationId: input.componentPreparationId });
      const created = await tx.preparationIngredient.create({
        data: {
          restaurantId,
          preparationId,
          inventoryItemId: input.inventoryItemId ?? null,
          componentPreparationId: input.componentPreparationId ?? null,
          quantity: input.quantity,
          costBase: costPerUnit.mul(input.quantity).toDecimalPlaces(4),
        },
      });
      await recomputeDependentCosts(tx, restaurantId);
      return created;
    });
  },

  async updateIngredient(restaurantId: string, id: string, input: UpdatePreparationIngredientInput) {
    const existing = await prisma.preparationIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');

    if (input.componentPreparationId) {
      const graph = await buildCostGraph(prisma, restaurantId);
      if (wouldCreateCycle(graph, existing.preparationId, input.componentPreparationId)) {
        throw badRequest('Esa preparación ya depende de esta — no se puede armar un ciclo.');
      }
    }

    return prisma.$transaction(async (tx) => {
      const nextInventoryItemId = input.inventoryItemId !== undefined ? input.inventoryItemId : existing.inventoryItemId;
      const nextComponentPreparationId = input.componentPreparationId !== undefined ? input.componentPreparationId : existing.componentPreparationId;
      const graph = await buildCostGraph(tx, restaurantId);
      const costPerUnit = resolveCostPerBaseUnit(graph, { inventoryItemId: nextInventoryItemId, preparationId: nextComponentPreparationId });
      const quantity = input.quantity ?? existing.quantity;

      const updated = await tx.preparationIngredient.update({
        where: { id },
        data: {
          ...(input.inventoryItemId !== undefined ? { inventoryItemId: input.inventoryItemId, componentPreparationId: null } : {}),
          ...(input.componentPreparationId !== undefined ? { componentPreparationId: input.componentPreparationId, inventoryItemId: null } : {}),
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          costBase: costPerUnit.mul(quantity).toDecimalPlaces(4),
        },
      });
      await recomputeDependentCosts(tx, restaurantId);
      return updated;
    });
  },

  async removeIngredient(restaurantId: string, id: string) {
    const existing = await prisma.preparationIngredient.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Ingrediente no encontrado.');

    return prisma.$transaction(async (tx) => {
      await tx.preparationIngredient.delete({ where: { id } });
      await recomputeDependentCosts(tx, restaurantId);
      return { deleted: true };
    });
  },
};
