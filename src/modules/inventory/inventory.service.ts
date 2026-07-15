import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { CreateInventoryItemInput, UpdateInventoryItemInput } from './inventory.dto';

/** Insumos de inventario (solo plan Premium). Aislado por restaurantId como el resto del dominio. */
export const inventoryService = {
  async list(restaurantId: string) {
    return prisma.inventoryItem.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  },

  async create(restaurantId: string, input: CreateInventoryItemInput) {
    return prisma.inventoryItem.create({
      data: { restaurantId, ...input },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateInventoryItemInput) {
    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    return prisma.inventoryItem.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.inventoryItem.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Insumo no encontrado.');
    await prisma.inventoryItem.delete({ where: { id } });
    return { deleted: true };
  },
};
