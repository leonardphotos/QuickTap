import { Prisma } from '@prisma/client';
import { round2, toDecimal } from '../../utils/money';

/**
 * Punto único de verdad para "cuánto cuesta 1 unidad base de X" (insumo o
 * preparación), usado tanto por recetas (RecipeIngredient) como por
 * preparaciones anidadas (PreparationIngredient) — evita duplicar la
 * recursión insumo↔preparación en dos módulos distintos.
 *
 * "Unidad base" = kg/lt/unidad para un insumo, o la sub-unidad (gr/ml) en la
 * que se declaran quantity/yieldQuantity en RecipeIngredient/Preparation.
 */

type TxClient = Prisma.TransactionClient;

interface GraphItem {
  id: string;
  pricePerUnitBase: Prisma.Decimal | null;
  yieldPercent: Prisma.Decimal;
  correctionPercent: Prisma.Decimal;
}

interface GraphIngredientRef {
  inventoryItemId: string | null;
  componentPreparationId?: string | null;
  preparationId?: string | null;
  quantity: Prisma.Decimal;
}

interface GraphPreparation {
  id: string;
  yieldQuantity: Prisma.Decimal;
  ingredients: GraphIngredientRef[];
}

export interface CostGraph {
  items: Map<string, GraphItem>;
  preparations: Map<string, GraphPreparation>;
  /** Recetas por plato, para resolver los combos que incluyen otros platos. */
  products: Map<string, IngredientRef[]>;
}

/** Referencia genérica a "un insumo o una preparación" — misma forma que usan
 * RecipeIngredient y PreparationIngredient (exactamente uno de los dos). */
export interface IngredientRef {
  inventoryItemId?: string | null;
  preparationId?: string | null;
  /** Combos: la línea es otro plato entero, con su propia receta. */
  componentProductId?: string | null;
  quantity?: Prisma.Decimal;
}

/** Carga en memoria todo el grafo de costeo del restaurante (insumos + preparaciones
 * con sus ingredientes). Los catálogos de un restaurante son chicos (decenas a un par
 * de cientos de filas), así que traer todo de una vez es más simple y más correcto que
 * ir resolviendo dependencias fila por fila. */
export async function buildCostGraph(tx: TxClient, restaurantId: string): Promise<CostGraph> {
  const [items, preparations, preparationIngredients, recipeLines] = await Promise.all([
    tx.inventoryItem.findMany({
      where: { restaurantId },
      select: { id: true, pricePerUnitBase: true, yieldPercent: true, correctionPercent: true },
    }),
    tx.preparation.findMany({ where: { restaurantId }, select: { id: true, yieldQuantity: true } }),
    tx.preparationIngredient.findMany({
      where: { restaurantId },
      select: { preparationId: true, inventoryItemId: true, componentPreparationId: true, quantity: true },
    }),
    // Recetas de los platos: hacen falta para resolver los combos, que apuntan a otro plato
    // en vez de a un insumo. Se traen enteras por el mismo motivo que las preparaciones — el
    // catálogo es chico y resolver fila por fila sería más frágil.
    tx.recipeIngredient.findMany({
      where: { restaurantId },
      select: { productId: true, inventoryItemId: true, preparationId: true, componentProductId: true, quantity: true },
    }),
  ]);

  const preparationMap = new Map<string, GraphPreparation>();
  for (const p of preparations) preparationMap.set(p.id, { id: p.id, yieldQuantity: p.yieldQuantity, ingredients: [] });
  for (const pi of preparationIngredients) {
    const prep = preparationMap.get(pi.preparationId);
    if (prep) prep.ingredients.push({ inventoryItemId: pi.inventoryItemId, preparationId: pi.componentPreparationId, quantity: pi.quantity });
  }

  const productMap = new Map<string, IngredientRef[]>();
  for (const rl of recipeLines) {
    const lineas = productMap.get(rl.productId) ?? [];
    lineas.push({
      inventoryItemId: rl.inventoryItemId,
      preparationId: rl.preparationId,
      componentProductId: rl.componentProductId,
      quantity: rl.quantity,
    });
    productMap.set(rl.productId, lineas);
  }

  return { items: new Map(items.map((i) => [i.id, i])), preparations: preparationMap, products: productMap };
}

function costPerBaseUnitForItem(item: GraphItem): Prisma.Decimal {
  if (!item.pricePerUnitBase) return toDecimal(0);
  const corrected = item.pricePerUnitBase.mul(toDecimal(1).add(item.correctionPercent.div(100)));
  const yieldFraction = item.yieldPercent.div(100);
  if (yieldFraction.lessThanOrEqualTo(0)) return toDecimal(0);
  return corrected.div(yieldFraction);
}

/** Costo por 1 unidad base del insumo o preparación referenciada. Recursivo para
 * preparaciones anidadas, con guarda de ciclos (no debería ocurrir — se bloquea al
 * guardar una preparación como su propio ingrediente — pero protege igual). */
export function resolveCostPerBaseUnit(graph: CostGraph, ref: IngredientRef, seen: Set<string> = new Set()): Prisma.Decimal {
  if (ref.inventoryItemId) {
    const item = graph.items.get(ref.inventoryItemId);
    return item ? costPerBaseUnitForItem(item) : toDecimal(0);
  }
  if (ref.preparationId) {
    if (seen.has(ref.preparationId)) return toDecimal(0);
    const prep = graph.preparations.get(ref.preparationId);
    if (!prep || prep.yieldQuantity.lessThanOrEqualTo(0)) return toDecimal(0);
    const nextSeen = new Set(seen).add(ref.preparationId);
    const total = prep.ingredients.reduce(
      (acc, ing) => acc.add((ing.quantity ?? toDecimal(0)).mul(resolveCostPerBaseUnit(graph, ing, nextSeen))),
      toDecimal(0),
    );
    return total.div(prep.yieldQuantity);
  }
  // Combos: cuesta lo que cuesta la receta entera del plato incluido. A diferencia de una
  // preparación no se divide por rendimiento — una hamburguesa es una hamburguesa, no un lote
  // del que salen porciones.
  if (ref.componentProductId) {
    if (seen.has(ref.componentProductId)) return toDecimal(0);
    const lineas = graph.products.get(ref.componentProductId);
    if (!lineas) return toDecimal(0);
    const nextSeen = new Set(seen).add(ref.componentProductId);
    return lineas.reduce(
      (acc, l) => acc.add((l.quantity ?? toDecimal(0)).mul(resolveCostPerBaseUnit(graph, l, nextSeen))),
      toDecimal(0),
    );
  }
  return toDecimal(0);
}

/**
 * Costo estimado de una línea de receta "A elección del cliente": promedio del costo por
 * unidad base entre los modificadores de esa categoría que ya tienen insumo vinculado — no se
 * sabe cuál va a elegir el cliente hasta el pedido, así que el promedio es la mejor estimación
 * para el costeo de la receta y la cascada de precio sugerido. El descuento REAL de stock, en
 * cambio, sí usa el insumo exacto que el cliente eligió (ver deductRecipeStock en
 * order.service.ts), esto es solo para mostrar un costo de referencia. Sin modificadores
 * vinculados todavía en esa categoría, cuesta 0.
 */
export async function resolveCustomerChoiceCostPerUnit(
  tx: TxClient,
  graph: CostGraph,
  restaurantId: string,
  categoryId: string,
  modifierId?: string | null,
): Promise<Prisma.Decimal> {
  // Topping concreto: su costo es exactamente el del insumo/preparación vinculado a ese modificador.
  const modifiers = await tx.modifier.findMany({
    where: {
      restaurantId,
      categoryId,
      OR: [{ inventoryItemId: { not: null } }, { preparationId: { not: null } }],
      ...(modifierId ? { id: modifierId } : {}),
    },
    select: { inventoryItemId: true, preparationId: true },
  });
  if (modifiers.length === 0) return toDecimal(0);
  const total = modifiers.reduce(
    (acc, m) => acc.add(resolveCostPerBaseUnit(graph, { inventoryItemId: m.inventoryItemId, preparationId: m.preparationId })),
    toDecimal(0),
  );
  return total.div(modifiers.length);
}

/** Recalcula y persiste (solo lo que cambió) el costBase de TODAS las líneas de
 * preparación y de receta del restaurante, a partir de un grafo fresco. Se llama
 * dentro de la misma transacción cuando cambia algo que puede afectar costos aguas
 * abajo: precio/rendimiento/corrección de un insumo, o ingredientes/rendimiento de
 * una preparación. Recalcular todo el grafo es deliberadamente más simple que
 * rastrear dependencias finas — el tamaño de estos catálogos lo permite. */
export async function recomputeDependentCosts(tx: TxClient, restaurantId: string): Promise<void> {
  const graph = await buildCostGraph(tx, restaurantId);

  const [preparationIngredients, recipeIngredients] = await Promise.all([
    tx.preparationIngredient.findMany({ where: { restaurantId } }),
    tx.recipeIngredient.findMany({ where: { restaurantId } }),
  ]);

  for (const pi of preparationIngredients) {
    const perUnit = resolveCostPerBaseUnit(graph, { inventoryItemId: pi.inventoryItemId, preparationId: pi.componentPreparationId });
    const costBase = perUnit.mul(pi.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (!costBase.equals(pi.costBase)) {
      await tx.preparationIngredient.update({ where: { id: pi.id }, data: { costBase } });
    }
  }

  for (const ri of recipeIngredients) {
    const perUnit = ri.customerChoiceModifierCategoryId
      ? await resolveCustomerChoiceCostPerUnit(tx, graph, restaurantId, ri.customerChoiceModifierCategoryId, ri.customerChoiceModifierId)
      : resolveCostPerBaseUnit(graph, {
          inventoryItemId: ri.inventoryItemId,
          preparationId: ri.preparationId,
          componentProductId: ri.componentProductId,
        });
    const costBase = round2(perUnit.mul(ri.quantity));
    if (!costBase.equals(ri.costBase)) {
      await tx.recipeIngredient.update({ where: { id: ri.id }, data: { costBase } });
    }
  }
}

/**
 * Resuelve "se consumió `multiplier` unidades base de este insumo/preparación" hasta
 * sus insumos finales, acumulando en `acc` (Map inventoryItemId -> cantidad total).
 * Usado por deductRecipeStock: una preparación no tiene stock propio, así que vender
 * un plato que la usa debe descontar los insumos base que la componen.
 */
export function resolveConsumedInventoryItems(
  graph: CostGraph,
  ref: IngredientRef,
  multiplier: Prisma.Decimal,
  acc: Map<string, Prisma.Decimal> = new Map(),
  seen: Set<string> = new Set(),
): Map<string, Prisma.Decimal> {
  if (ref.inventoryItemId) {
    acc.set(ref.inventoryItemId, (acc.get(ref.inventoryItemId) ?? toDecimal(0)).add(multiplier));
    return acc;
  }
  if (ref.preparationId) {
    if (seen.has(ref.preparationId)) return acc;
    const prep = graph.preparations.get(ref.preparationId);
    if (!prep || prep.yieldQuantity.lessThanOrEqualTo(0)) return acc;
    const nextSeen = new Set(seen).add(ref.preparationId);
    const ratio = multiplier.div(prep.yieldQuantity);
    for (const ing of prep.ingredients) {
      resolveConsumedInventoryItems(graph, ing, (ing.quantity ?? toDecimal(0)).mul(ratio), acc, nextSeen);
    }
  }
  // Combos: vender el combo descuenta los insumos de cada plato que lo compone, hasta el fondo.
  // Sin esto el stock del combo no movería nada y el inventario quedaría inflado.
  if (ref.componentProductId) {
    if (seen.has(ref.componentProductId)) return acc;
    const lineas = graph.products.get(ref.componentProductId);
    if (!lineas) return acc;
    const nextSeen = new Set(seen).add(ref.componentProductId);
    for (const l of lineas) {
      resolveConsumedInventoryItems(graph, l, (l.quantity ?? toDecimal(0)).mul(multiplier), acc, nextSeen);
    }
  }
  return acc;
}
