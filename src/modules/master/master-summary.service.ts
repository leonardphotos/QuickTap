import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Suma ingresos de un conjunto de órdenes. `totalBs` siempre es sumable (ya
 * congelado en bolívares al momento de cada pedido). `totalBase` solo se suma
 * para órdenes en USD: mezclar USD+EUR sin convertir daría una cifra
 * incorrecta, así que el total en "$" excluye restaurantes que facturan en €.
 */
function sumRevenue(orders: { totalBs: unknown; totalBase: unknown; currency: string }[]) {
  const revenueBs = round2(orders.reduce((acc, o) => acc.add(toDecimal(o.totalBs as string)), toDecimal(0)));
  const revenueUsd = round2(
    orders.filter((o) => o.currency === 'USD').reduce((acc, o) => acc.add(toDecimal(o.totalBase as string)), toDecimal(0)),
  );
  return { revenueBs: revenueBs.toFixed(2), revenueUsd: revenueUsd.toFixed(2) };
}

export const masterSummaryService = {
  async get() {
    const monthStart = startOfCurrentMonth();

    // La cuenta de demostración (seed-demo.ts, isDemo: true) se excluye de
    // todo el reporte: no es facturación ni actividad real de la plataforma.
    const [monthOrders, allOrders, restaurantOwners, totalRestaurants, activeRestaurants] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: monthStart }, status: { not: 'CANCELLED' }, restaurant: { isDemo: false } },
        select: { totalBs: true, totalBase: true, currency: true },
      }),
      prisma.order.findMany({
        where: { status: { not: 'CANCELLED' }, restaurant: { isDemo: false } },
        select: { totalBs: true, totalBase: true, currency: true },
      }),
      prisma.user.count({ where: { role: 'OWNER', restaurant: { isDemo: false } } }),
      prisma.restaurant.count({ where: { isDemo: false } }),
      // Aproximación: no descuenta el bloqueo por vencimiento (se calcula en
      // vivo con periodEnd + 12h de gracia, no se persiste), igual que el
      // resto del código trata ese estado.
      prisma.restaurant.count({ where: { subscriptionStatus: 'ACTIVE', suspended: false, isDemo: false } }),
    ]);

    return {
      month: sumRevenue(monthOrders),
      allTime: sumRevenue(allOrders),
      restaurantOwners,
      totalRestaurants,
      activeRestaurants,
    };
  },
};
