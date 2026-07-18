import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateProductInput, UpdateProductInput } from './product.dto';

/**
 * Servicio de productos. TODAS las operaciones reciben `restaurantId` para
 * garantizar el aislamiento por inquilino: nunca se lee ni escribe fuera del
 * tenant activo.
 */
export const productService = {
  async list(restaurantId: string) {
    return prisma.product.findMany({
      where: { restaurantId },
      orderBy: [{ categoryId: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });
  },

  async getById(restaurantId: string, id: string) {
    const product = await prisma.product.findFirst({ where: { id, restaurantId } });
    if (!product) throw notFound('Producto no encontrado.');
    return product;
  },

  async create(restaurantId: string, input: CreateProductInput) {
    // La categoría debe pertenecer al mismo restaurante (evita fugas de tenant).
    await assertCategoryBelongs(restaurantId, input.categoryId);
    if (input.kitchenId) await assertKitchenBelongs(restaurantId, input.kitchenId);

    return prisma.product.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        kitchenId: input.kitchenId,
        name: input.name,
        description: input.description,
        price: input.price,
        costSource: input.costSource,
        costBase: input.costBase,
        photoUrl: input.photoUrl,
        prepTimeMinutes: input.prepTimeMinutes,
        isAvailable: input.isAvailable,
        isStar: input.isStar,
        isPromo: input.isPromo,
        isHouseSpecial: input.isHouseSpecial,
        priority: input.priority,
      },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateProductInput) {
    await this.getById(restaurantId, id); // valida pertenencia al tenant

    if (input.categoryId) {
      await assertCategoryBelongs(restaurantId, input.categoryId);
    }
    if (input.kitchenId) {
      await assertKitchenBelongs(restaurantId, input.kitchenId);
    }

    return prisma.product.update({
      where: { id },
      data: input,
    });
  },

  async remove(restaurantId: string, id: string) {
    await this.getById(restaurantId, id);
    await prisma.product.delete({ where: { id } });
    return { deleted: true };
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
