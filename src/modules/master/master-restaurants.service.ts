import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { daysRemaining, isLocked } from '../../utils/subscription';

function withSubscriptionInfo<T extends { periodEnd: Date }>(restaurant: T) {
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
};
