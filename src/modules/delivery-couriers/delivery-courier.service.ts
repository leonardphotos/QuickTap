import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { CreateDeliveryCourierInput, UpdateDeliveryCourierInput } from './delivery-courier.dto';

export const deliveryCourierService = {
  async list(restaurantId: string) {
    return prisma.deliveryCourier.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
  },

  async create(restaurantId: string, input: CreateDeliveryCourierInput) {
    return prisma.deliveryCourier.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateDeliveryCourierInput) {
    const existing = await prisma.deliveryCourier.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Repartidor no encontrado.');
    return prisma.deliveryCourier.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.deliveryCourier.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Repartidor no encontrado.');
    await prisma.deliveryCourier.delete({ where: { id } });
    return { deleted: true };
  },
};
