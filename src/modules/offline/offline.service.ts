import { prisma } from '../../config/prisma';
import { computeRecipeStockDeltas } from '../orders/order.service';

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
};

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
