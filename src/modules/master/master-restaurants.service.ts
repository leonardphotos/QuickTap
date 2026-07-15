import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { daysRemaining, isLocked } from '../../utils/subscription';
import { UpdateRestaurantUserInput } from './master-restaurants.dto';

const USER_SELECT = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

function withSubscriptionInfo<T extends { periodEnd: Date; suspended: boolean }>(restaurant: T) {
  return {
    ...restaurant,
    locked: isLocked(restaurant),
    daysRemaining: daysRemaining(restaurant),
  };
}

export const masterRestaurantsService = {
  /** Lista de todos los restaurantes para el Dashboard maestro. */
  async list() {
    const restaurants = await prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        billingCycle: true,
        periodEnd: true,
        suspended: true,
        createdAt: true,
        _count: { select: { users: true, tables: true, orders: true } },
      },
    });
    return restaurants.map(withSubscriptionInfo);
  },

  /** Detalle + actividad de un restaurante puntual. */
  async detail(id: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } },
        _count: { select: { products: true, tables: true, orders: true } },
      },
    });
    if (!restaurant) throw notFound('Restaurante no encontrado.');

    const recentOrders = await prisma.order.findMany({
      where: { restaurantId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        channel: true,
        status: true,
        currency: true,
        totalBase: true,
        createdAt: true,
      },
    });

    return { ...withSubscriptionInfo(restaurant), recentOrders };
  },

  /** Bloqueo/desbloqueo manual, independiente del vencimiento del plan. */
  async setSuspended(id: string, suspended: boolean) {
    const existing = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Restaurante no encontrado.');
    return prisma.restaurant.update({ where: { id }, data: { suspended } });
  },

  /** Extiende (o recorta, con días negativos) el vencimiento del plan por una cantidad exacta de días. */
  async extendDays(id: string, days: number) {
    const existing = await prisma.restaurant.findUnique({ where: { id }, select: { periodEnd: true } });
    if (!existing) throw notFound('Restaurante no encontrado.');
    if (!Number.isFinite(days) || Math.abs(days) > 3650) throw badRequest('Cantidad de días inválida.');

    const periodEnd = new Date(existing.periodEnd.getTime() + days * 24 * 60 * 60 * 1000);
    return prisma.restaurant.update({ where: { id }, data: { periodEnd } });
  },

  /** Fija el vencimiento a una fecha exacta (día/mes/año), en vez de ajustarlo relativamente. */
  async setPeriodEnd(id: string, periodEnd: Date) {
    const existing = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Restaurante no encontrado.');
    if (Number.isNaN(periodEnd.getTime())) throw badRequest('Fecha inválida.');
    return prisma.restaurant.update({ where: { id }, data: { periodEnd } });
  },

  /** Edita nombre/correo/contraseña de un usuario del restaurante (incluido el dueño). */
  async updateUser(restaurantId: string, userId: string, input: UpdateRestaurantUserInput) {
    const user = await prisma.user.findFirst({ where: { id: userId, restaurantId }, select: { id: true } });
    if (!user) throw notFound('Usuario no encontrado.');

    if (input.email) {
      const existing = await prisma.user.findFirst({
        where: { restaurantId, email: { equals: input.email, mode: 'insensitive' }, id: { not: userId } },
        select: { id: true },
      });
      if (existing) throw badRequest('Ya existe otro usuario con ese correo en este restaurante.');
    }

    const data: { name?: string; email?: string; passwordHash?: string } = {};
    if (input.name) data.name = input.name;
    if (input.email) data.email = input.email;
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

    return prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
  },

  /**
   * Elimina el restaurante y todo lo que le pertenece (usuarios, pedidos,
   * productos, mesas, zonas, etc. — cascada en el esquema). No se puede deshacer.
   */
  async remove(id: string) {
    const existing = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Restaurante no encontrado.');
    await prisma.restaurant.delete({ where: { id } });
    return { deleted: true };
  },
};
