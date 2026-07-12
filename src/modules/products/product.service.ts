import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
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

    return prisma.product.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        price: input.price,
        photoUrl: input.photoUrl,
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
};

async function assertCategoryBelongs(restaurantId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, restaurantId },
    select: { id: true },
  });
  if (!category) throw badRequest('La categoría no existe o no pertenece a este restaurante.');
}
