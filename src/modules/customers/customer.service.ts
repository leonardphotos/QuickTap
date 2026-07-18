import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { CreateCustomerInput, CustomerQuery, UpdateCustomerInput } from './customer.dto';

export const customerService = {
  async list(restaurantId: string, query: CustomerQuery) {
    const search = query.search?.trim();
    return prisma.customer.findMany({
      where: {
        restaurantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { idNumber: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  },

  async create(restaurantId: string, input: CreateCustomerInput) {
    const existing = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
    });
    if (existing) throw conflict('Ya existe un cliente con ese teléfono.');
    return prisma.customer.create({ data: { restaurantId, ...input } });
  },

  async update(restaurantId: string, id: string, input: UpdateCustomerInput) {
    const existing = await prisma.customer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cliente no encontrado.');
    return prisma.customer.update({ where: { id }, data: input });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.customer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cliente no encontrado.');
    await prisma.customer.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * Crea o actualiza el cliente por teléfono cada vez que se abre una cuenta
   * de mesa o se hace un pedido con datos de contacto, para poder buscarlo
   * después en vez de tipear los datos de nuevo. Sin teléfono no hay forma
   * confiable de identificarlo, así que no hace nada.
   */
  async upsertFromOrder(
    restaurantId: string,
    data: { name?: string | null; phone?: string | null; idNumber?: string | null; address?: string | null },
  ) {
    if (!data.phone || !data.name) return;
    await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId, phone: data.phone } },
      create: {
        restaurantId,
        name: data.name,
        phone: data.phone,
        idNumber: data.idNumber ?? undefined,
        address: data.address ?? undefined,
      },
      update: {
        name: data.name,
        idNumber: data.idNumber ?? undefined,
        address: data.address ?? undefined,
      },
    });
  },
};
