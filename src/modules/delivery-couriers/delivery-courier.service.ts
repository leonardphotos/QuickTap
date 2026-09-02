import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
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

  /**
   * Borra un repartidor, pero SOLO si nunca despachó nada.
   *
   * La relación es `onDelete: SetNull`, así que borrar a alguien con historial no rompía nada
   * visiblemente — le vaciaba el repartidor a todos sus pedidos pasados y esas entregas
   * desaparecían del reporte "movimiento por repartidor". Los números de meses ya cerrados
   * cambiaban solos, sin aviso. Para sacar a alguien del equipo está `isActive: false`, que
   * lo quita de las listas y del reparto automático sin tocar lo que ya hizo.
   */
  async remove(restaurantId: string, id: string) {
    const existing = await prisma.deliveryCourier.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Repartidor no encontrado.');

    const entregas = await prisma.order.count({ where: { restaurantId, deliveryCourierId: id } });
    if (entregas > 0) {
      throw badRequest(
        `${existing.name} tiene ${entregas} pedido${entregas === 1 ? '' : 's'} en su historial. ` +
          'Bórralo solo si nunca despachó: para sacarlo del equipo desactívalo, así sus entregas siguen contando en los reportes.',
      );
    }

    await prisma.deliveryCourier.delete({ where: { id } });
    return { deleted: true };
  },
};
