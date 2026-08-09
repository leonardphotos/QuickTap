import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { startOfDayCaracas } from '../../utils/timezone';
import { resolveInventoryScope } from '../inventory/inventory-scope';
import { CreateProductInput, UpdateProductInput } from './product.dto';

/** "YYYY-MM-DD" -> medianoche Caracas en UTC (igual que el resto del sistema, ver timezone.ts).
 * undefined = no tocar el campo; null = borrarlo. */
function toPromoDate(dateStr: string | null | undefined): Date | null | undefined {
  if (dateStr === undefined) return undefined;
  if (dateStr === null) return null;
  return startOfDayCaracas(dateStr);
}

/**
 * Servicio de productos. TODAS las operaciones reciben `restaurantId` para
 * garantizar el aislamiento por inquilino: nunca se lee ni escribe fuera del
 * tenant activo.
 */
const PRODUCT_MODIFIER_INCLUDE = {
  modifierCategories: {
    include: {
      modifierCategory: {
        include: {
          modifiers: {
            orderBy: [{ priority: 'asc' as const }, { name: 'asc' as const }],
            include: { variantPrices: { select: { variantId: true, priceBase: true } } },
          },
        },
      },
    },
  },
};

/** Aplana la fila de asociación (ProductModifierCategory -> ModifierCategory) para el frontend,
 * resolviendo el límite efectivo de selecciones (override del producto, si lo tiene, si no el de
 * la categoría) para que el cliente solo tenga que leer un único `maxSelections` ya resuelto. */
function serializeProduct<
  T extends {
    stockControlEnabled: boolean;
    stockQuantity: number | null;
    modifierCategories: {
      maxSelectionsOverride: number | null;
      modifierCategory: {
        id: string;
        name: string;
        isRequired: boolean;
        allowMultiple: boolean;
        maxSelections: number | null;
        modifiers: unknown[];
      };
    }[];
  },
>(product: T) {
  const { modifierCategories, ...rest } = product;
  return {
    ...rest,
    // Distingue "agotado por stock" de "desactivado a mano" (isAvailable) para el panel.
    stockDepleted: rest.stockControlEnabled && (rest.stockQuantity ?? 0) <= 0,
    modifierCategories: modifierCategories.map((link) => ({
      ...link.modifierCategory,
      maxSelections: link.maxSelectionsOverride ?? link.modifierCategory.maxSelections,
    })),
  };
}

export const productService = {
  async list(restaurantId: string) {
    const products = await prisma.product.findMany({
      where: { restaurantId },
      orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        variants: { orderBy: [{ priority: 'asc' }, { name: 'asc' }] },
        // Precio del envase vinculado (packagingMode INVENTORY): sin esto el panel no puede
        // mostrar el cargo por envase que el servidor sí cobra en Delivery/Pickup.
        packagingItem: { select: { salePriceBase: true } },
        ...PRODUCT_MODIFIER_INCLUDE,
      },
    });
    return products.map(serializeProduct);
  },

  async getById(restaurantId: string, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, restaurantId },
      include: {
        variants: { orderBy: [{ priority: 'asc' }, { name: 'asc' }] },
        ...PRODUCT_MODIFIER_INCLUDE,
      },
    });
    if (!product) throw notFound('Producto no encontrado.');
    return serializeProduct(product);
  },

  async create(restaurantId: string, parentRestaurantId: string | null | undefined, input: CreateProductInput) {
    // La categoría debe pertenecer al mismo restaurante (evita fugas de tenant).
    await assertCategoryBelongs(restaurantId, input.categoryId);
    if (input.kitchenId) await assertKitchenBelongs(restaurantId, input.kitchenId);
    if (input.packagingItemId) await assertPackagingItemBelongs(restaurantId, parentRestaurantId, input.packagingItemId);

    return prisma.product.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        kitchenId: input.kitchenId,
        name: input.name,
        description: input.description,
        price: input.price,
        pricingMode: input.pricingMode,
        costSource: input.costSource,
        costBase: input.costBase,
        photoUrl: input.photoUrl,
        prepTimeMinutes: input.prepTimeMinutes,
        sku: input.sku,
        stockControlEnabled: input.stockControlEnabled,
        stockQuantity: input.stockQuantity,
        stockMinQuantity: input.stockMinQuantity,
        expiryDate: input.expiryDate,
        packagingMode: input.packagingMode,
        packagingFeeBase: input.packagingFeeBase,
        packagingItemId: input.packagingItemId,
        isAvailable: input.isAvailable,
        isStar: input.isStar,
        isPromo: input.isPromo,
        isHouseSpecial: input.isHouseSpecial,
        promoPriceEnabled: input.promoPriceEnabled,
        promoPrice: input.promoPrice,
        promoStartTime: input.promoStartTime,
        promoEndTime: input.promoEndTime,
        promoDaysOfWeek: input.promoDaysOfWeek,
        promoStartDate: toPromoDate(input.promoStartDate) ?? undefined,
        promoEndDate: toPromoDate(input.promoEndDate) ?? undefined,
        priority: input.priority,
      },
    });
  },

  async update(restaurantId: string, parentRestaurantId: string | null | undefined, id: string, input: UpdateProductInput) {
    await this.getById(restaurantId, id); // valida pertenencia al tenant

    if (input.categoryId) {
      await assertCategoryBelongs(restaurantId, input.categoryId);
    }
    if (input.kitchenId) {
      await assertKitchenBelongs(restaurantId, input.kitchenId);
    }
    if (input.packagingItemId) {
      await assertPackagingItemBelongs(restaurantId, parentRestaurantId, input.packagingItemId);
    }

    const { promoStartDate, promoEndDate, ...rest } = input;
    return prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(promoStartDate !== undefined ? { promoStartDate: toPromoDate(promoStartDate) } : {}),
        ...(promoEndDate !== undefined ? { promoEndDate: toPromoDate(promoEndDate) } : {}),
      },
    });
  },

  async remove(restaurantId: string, id: string) {
    await this.getById(restaurantId, id);
    await prisma.product.delete({ where: { id } });
    return { deleted: true };
  },

  /** Borrado masivo: solo borra los ids que realmente pertenecen a este restaurantId
   * (mismo aislamiento que remove()), ignorando en silencio los que no. */
  async bulkRemove(restaurantId: string, ids: string[]) {
    const owned = await prisma.product.findMany({
      where: { id: { in: ids }, restaurantId },
      select: { id: true },
    });
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: ownedIds } } });
    }
    return { deleted: ownedIds.length };
  },

  /** Administración → Margen de utilidad: costo efectivo (receta o manual) vs. precio, por producto. */
  async listWithMargin(restaurantId: string) {
    const [products, recipeSums] = await Promise.all([
      prisma.product.findMany({
        where: { restaurantId },
        orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
        include: { category: { select: { name: true } } },
      }),
      prisma.recipeIngredient.groupBy({ by: ['productId'], where: { restaurantId }, _sum: { costBase: true } }),
    ]);

    const recipeCostByProduct = new Map(recipeSums.map((r) => [r.productId, toDecimal(r._sum.costBase ?? 0)]));

    return products.map((p) => {
      const costBase =
        p.costSource === 'RECIPE' ? (recipeCostByProduct.get(p.id) ?? toDecimal(0)) : toDecimal(p.costBase ?? 0);
      const marginBase = round2(toDecimal(p.price).sub(costBase));
      const marginPercent = Number(p.price) > 0 ? round2(marginBase.div(p.price).mul(100)) : toDecimal(0);

      return {
        id: p.id,
        name: p.name,
        categoryName: p.category.name,
        price: p.price.toFixed(2),
        costSource: p.costSource,
        costBase: round2(costBase).toFixed(2),
        marginBase: marginBase.toFixed(2),
        marginPercent: marginPercent.toFixed(1),
      };
    });
  },
};

async function assertCategoryBelongs(restaurantId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, restaurantId },
    select: { id: true },
  });
  if (!category) throw badRequest('La categoría no existe o no pertenece a este restaurante.');
}

async function assertKitchenBelongs(restaurantId: string, kitchenId: string) {
  const kitchen = await prisma.kitchen.findFirst({
    where: { id: kitchenId, restaurantId },
    select: { id: true },
  });
  if (!kitchen) throw badRequest('La cocina no existe o no pertenece a este restaurante.');
}

async function assertPackagingItemBelongs(
  restaurantId: string,
  parentRestaurantId: string | null | undefined,
  packagingItemId: string,
) {
  const effectiveId = await resolveInventoryScope(restaurantId, parentRestaurantId);
  const item = await prisma.inventoryItem.findFirst({
    where: { id: packagingItemId, restaurantId: effectiveId, locationScope: 'LOCAL', packagingType: { not: null } },
    select: { id: true },
  });
  if (!item) throw badRequest('El insumo de envase no existe o no está marcado como envase.');
}
