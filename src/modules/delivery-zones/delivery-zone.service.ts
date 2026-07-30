import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { BulkCreateDeliveryZonesInput, CreateDeliveryZoneInput, UpdateDeliveryZoneInput } from './delivery-zone.dto';

export const deliveryZoneService = {
  async list(restaurantId: string) {
    return prisma.deliveryZone.findMany({ where: { restaurantId }, orderBy: { createdAt: 'asc' } });
  },

  async create(restaurantId: string, input: CreateDeliveryZoneInput) {
    return prisma.deliveryZone.create({
      data: { restaurantId, name: input.name, price: input.price, polygon: input.polygon },
    });
  },

  /**
   * Importa varias zonas de una sola vez (lista escrita ya interpretada y
   * revisada en el navegador). En una transacción: si una fila falla, no queda
   * media lista a medio cargar que el restaurante tenga que limpiar a mano.
   */
  async bulkCreate(restaurantId: string, input: BulkCreateDeliveryZonesInput) {
    const created = await prisma.$transaction(
      input.zones.map((zone) =>
        prisma.deliveryZone.create({
          data: { restaurantId, name: zone.name, price: zone.price, polygon: zone.polygon },
        }),
      ),
    );
    return { created: created.length };
  },

  async update(restaurantId: string, id: string, input: UpdateDeliveryZoneInput) {
    const existing = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Zona no encontrada.');
    return prisma.deliveryZone.update({
      where: { id },
      data: { ...input, polygon: input.polygon ?? undefined },
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Zona no encontrada.');
    await prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true };
  },
};
