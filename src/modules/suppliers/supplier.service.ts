import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreateSupplierInput, UpdateSupplierInput } from './supplier.dto';

export const supplierService = {
  async list(restaurantId: string) {
    return prisma.supplier.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { movements: true } } },
    });
  },

  async create(restaurantId: string, input: CreateSupplierInput) {
    return prisma.supplier.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateSupplierInput) {
    const existing = await prisma.supplier.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Proveedor no encontrado.');
    return prisma.supplier.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.supplier.findFirst({
      where: { id, restaurantId },
      include: { _count: { select: { movements: true } } },
    });
    if (!existing) throw notFound('Proveedor no encontrado.');
    if (existing._count.movements > 0) {
      throw conflict('No puedes borrar un proveedor con gastos registrados.');
    }
    await prisma.supplier.delete({ where: { id } });
    return { deleted: true };
  },
};
