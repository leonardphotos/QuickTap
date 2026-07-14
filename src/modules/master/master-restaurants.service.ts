import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { daysRemaining, isLocked } from '../../utils/subscription';

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
};
