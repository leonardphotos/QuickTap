import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreateZoneInput, UpdateZoneInput } from './zone.dto';

export const zoneService = {
  async list(restaurantId: string) {
    return prisma.zone.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { tables: true } } },
    });
  },

  async create(restaurantId: string, input: CreateZoneInput) {
    return prisma.zone.create({
      data: { restaurantId, name: input.name, priority: input.priority },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateZoneInput) {
    await this.getById(restaurantId, id);
    return prisma.zone.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const zone = await this.getById(restaurantId, id);
    const tableCount = await prisma.table.count({ where: { zoneId: zone.id } });
    if (tableCount > 0) {
      throw conflict('No se puede eliminar una zona que tiene mesas asignadas.');
    }
    await prisma.zone.delete({ where: { id } });
    return { deleted: true };
  },

  async getById(restaurantId: string, id: string) {
    const zone = await prisma.zone.findFirst({ where: { id, restaurantId } });
    if (!zone) throw notFound('Zona no encontrada.');
    return zone;
  },
};
