import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { CreateKitchenInput, UpdateKitchenInput } from './kitchen.dto';

const MAX_KITCHENS_PER_RESTAURANT = 10;

export const kitchenService = {
  async list(restaurantId: string) {
    return prisma.kitchen.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  },

  async create(restaurantId: string, input: CreateKitchenInput) {
    const count = await prisma.kitchen.count({ where: { restaurantId } });
    if (count >= MAX_KITCHENS_PER_RESTAURANT) {
      throw badRequest(`Máximo ${MAX_KITCHENS_PER_RESTAURANT} cocinas por restaurante.`);
    }
    const existing = await prisma.kitchen.findFirst({ where: { restaurantId, name: input.name } });
    if (existing) throw conflict('Ya existe una cocina con ese nombre.');

    return prisma.kitchen.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateKitchenInput) {
    const existing = await prisma.kitchen.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cocina no encontrada.');
    return prisma.kitchen.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.kitchen.findFirst({
      where: { id, restaurantId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw notFound('Cocina no encontrada.');
    if (existing._count.products > 0) {
      throw conflict('No puedes borrar una cocina con productos asignados. Reasígnalos primero.');
    }
    await prisma.kitchen.delete({ where: { id } });
    return { deleted: true };
  },
};
