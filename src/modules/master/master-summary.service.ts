import { prisma } from '../../config/prisma';
import { baseToBs, round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';

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

/**
 * Ingresos propios de QuickTap (no de los restaurantes clientes): suma de
 * inscripciones + mensualidades aprobadas (`PlanRequest.status = APPROVED`).
 * Las cotizaciones QR/NFC quedan fuera: su estado `APPROVED` solo significa
 * "atendida" por el equipo, no que se haya cobrado.
 */
async function sumQuickTapRevenue() {
  const approved = await prisma.planRequest.findMany({
    where: { status: 'APPROVED' },
    select: { priceUsd: true },
  });
  const revenueUsd = round2(approved.reduce((acc, p) => acc.add(p.priceUsd), toDecimal(0)));

  let revenueBs = toDecimal(0);
  try {
    const { rateBs } = await exchangeRateService.getRate('USD');
    revenueBs = baseToBs(revenueUsd, rateBs);
  } catch {
    // Sin tasa BCV cacheada todavía: se muestra 0 en Bs en vez de romper el summary.
  }

  return { revenueUsd: revenueUsd.toFixed(2), revenueBs: revenueBs.toFixed(2) };
}

export const masterSummaryService = {
  async get() {
    const monthStart = startOfCurrentMonth();

    // La cuenta de demostración (seed-demo.ts, isDemo: true) se excluye de
    // todo el reporte: no es facturación ni actividad real de la plataforma.
    // Las sucursales (parentRestaurantId seteado, ver src/modules/branches/)
    // tampoco son cuentas propias que le pagan a QuickTap por separado —
    // se excluyen igual para no inflar/duplicar restaurantes/dueños.
    const [monthOrders, quickTap, restaurantOwners, totalRestaurants, activeRestaurants] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: monthStart },
          status: { not: 'CANCELLED' },
          restaurant: { isDemo: false, parentRestaurantId: null },
        },
        select: { totalBs: true, totalBase: true, currency: true },
      }),
      sumQuickTapRevenue(),
      prisma.user.count({ where: { role: 'OWNER', restaurant: { isDemo: false, parentRestaurantId: null } } }),
      prisma.restaurant.count({ where: { isDemo: false, parentRestaurantId: null } }),
      // Aproximación: no descuenta el bloqueo por vencimiento (se calcula en
      // vivo con periodEnd + 12h de gracia, no se persiste), igual que el
      // resto del código trata ese estado.
      prisma.restaurant.count({
        where: { subscriptionStatus: 'ACTIVE', suspended: false, isDemo: false, parentRestaurantId: null },
      }),
    ]);

    return {
      month: sumRevenue(monthOrders),
      quickTap,
      restaurantOwners,
      totalRestaurants,
      activeRestaurants,
    };
  },
};
