import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { CreateInventoryCategoryInput, UpdateInventoryCategoryInput } from './inventory-category.dto';

/** Categorías de insumos y de "Stock de productos" en Inventario. Aisladas por restaurantId. */
export const inventoryCategoryService = {
  async list(restaurantId: string) {
    return prisma.inventoryCategory.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  },

  async create(restaurantId: string, input: CreateInventoryCategoryInput) {
    return prisma.inventoryCategory.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateInventoryCategoryInput) {
    const existing = await prisma.inventoryCategory.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Categoría no encontrada.');
    return prisma.inventoryCategory.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.inventoryCategory.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Categoría no encontrada.');
    await prisma.inventoryCategory.delete({ where: { id } });
    return { deleted: true };
  },

  /** La categoría debe pertenecer al mismo restaurante (evita fugas de tenant). */
  async assertBelongs(restaurantId: string, categoryId: string) {
    const category = await prisma.inventoryCategory.findFirst({ where: { id: categoryId, restaurantId } });
    if (!category) throw badRequest('La categoría seleccionada no es válida.');
  },
};
