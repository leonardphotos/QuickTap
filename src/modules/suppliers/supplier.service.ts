import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreateSupplierInput, RateSupplierInput, UpdateSupplierInput } from './supplier.dto';

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

  // ------------------------------------------- Calificación de proveedores (módulo Compras)

  /**
   * Ranking de proveedores por su calificación promedio (4 criterios de 1 a 5) más el número
   * de compras registradas. Los que aún no tienen evaluación salen al final, para que se vea
   * a quién falta calificar.
   */
  async ratings(restaurantId: string) {
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { movements: true, ratings: true } },
        ratings: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    const avg = (rows: number[]) => (rows.length ? Math.round((rows.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10 : null);
    return suppliers
      .map((s) => {
        const overallEach = s.ratings.map((r) => (r.quality + r.price + r.punctuality + r.service) / 4);
        return {
          id: s.id,
          name: s.name,
          phone: s.phone,
          taxId: s.taxId,
          purchases: s._count.movements,
          ratingCount: s._count.ratings,
          overall: avg(overallEach),
          quality: avg(s.ratings.map((r) => r.quality)),
          price: avg(s.ratings.map((r) => r.price)),
          punctuality: avg(s.ratings.map((r) => r.punctuality)),
          service: avg(s.ratings.map((r) => r.service)),
          lastRatedAt: s.ratings[0]?.createdAt ?? null,
          history: s.ratings.map((r) => ({
            id: r.id,
            quality: r.quality,
            price: r.price,
            punctuality: r.punctuality,
            service: r.service,
            comment: r.comment,
            createdAt: r.createdAt,
          })),
        };
      })
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name, 'es'));
  },

  async rate(restaurantId: string, supplierId: string, userId: string | undefined, input: RateSupplierInput) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, restaurantId }, select: { id: true } });
    if (!supplier) throw notFound('Proveedor no encontrado.');
    return prisma.supplierRating.create({
      data: {
        restaurantId,
        supplierId,
        quality: input.quality,
        price: input.price,
        punctuality: input.punctuality,
        service: input.service,
        comment: input.comment?.trim() || null,
        createdByUserId: userId ?? null,
      },
    });
  },

  async removeRating(restaurantId: string, ratingId: string) {
    const existing = await prisma.supplierRating.findFirst({ where: { id: ratingId, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Calificación no encontrada.');
    await prisma.supplierRating.delete({ where: { id: ratingId } });
    return { deleted: true };
  },
};
