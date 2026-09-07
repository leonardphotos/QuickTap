import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreateCategoryInput, ReorderCategoriesInput, UpdateCategoryInput } from './category.dto';

export const categoryService = {
  async list(restaurantId: string) {
    return prisma.category.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  },

  async create(restaurantId: string, input: CreateCategoryInput) {
    return prisma.category.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateCategoryInput) {
    const existing = await prisma.category.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Categoría no encontrada.');
    return prisma.category.update({ where: { id }, data: input });
  },

  async reorder(restaurantId: string, input: ReorderCategoriesInput) {
    const categories = await prisma.category.findMany({
      where: { restaurantId, id: { in: input.categoryIds } },
      select: { id: true },
    });
    if (categories.length !== input.categoryIds.length) throw notFound('Una de las categorías no existe.');
    await prisma.$transaction(
      input.categoryIds.map((id, priority) => prisma.category.update({ where: { id }, data: { priority } })),
    );
    return { reordered: true };
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.category.findFirst({
      where: { id, restaurantId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw notFound('Categoría no encontrada.');
    if (existing._count.products > 0) {
      throw conflict('No puedes borrar una categoría con productos. Muévelos o bórralos primero.');
    }
    await prisma.category.delete({ where: { id } });
    return { deleted: true };
  },
};
