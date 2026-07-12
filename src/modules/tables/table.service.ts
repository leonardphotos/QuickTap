import { nanoid } from 'nanoid';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { CreateTableInput } from './table.dto';

export const tableService = {
  async list(restaurantId: string) {
    return prisma.table.findMany({ where: { restaurantId }, orderBy: { number: 'asc' } });
  },

  /** Crea la mesa con un qrToken único; ese token es lo que va embebido en el QR. */
  async create(restaurantId: string, input: CreateTableInput) {
    return prisma.table.create({
      data: { restaurantId, number: input.number, qrToken: nanoid(14) },
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.table.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Mesa no encontrada.');
    await prisma.table.delete({ where: { id } });
    return { deleted: true };
  },
};
