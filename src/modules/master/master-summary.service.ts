import { prisma } from '../../config/prisma';
import { baseToBs, bsToBase, round2, toDecimal } from '../../utils/money';
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

/**
 * Total histórico de pedidos procesados por la plataforma, para el contador en vivo del
 * Dashboard maestro. Se excluye la cuenta demo porque su simulador genera un pedido cada pocos
 * segundos: incluirla haría que el 95% del número fuera relleno y que el contador subiera solo,
 * sin actividad real detrás. Las sucursales SÍ cuentan (son pedidos reales de locales reales,
 * a diferencia del conteo de restaurantes/dueños, donde se excluyen por no ser cuentas propias).
 * Tampoco se descuentan los cancelados: es "cuántos pedidos se hicieron", y así el contador
 * nunca retrocede.
 */
function countOrdersAllTime(): Promise<number> {
  return prisma.order.count({ where: { restaurant: { isDemo: false } } });
}

/**
 * Monto total facturado por esos mismos pedidos, en Bs y su equivalente en $.
 *
 * Se suma `totalBs` en vez de `totalBase`: la moneda base varía por restaurante (unos cargan
 * precios en $ y otros en €), así que sumar totalBase mezclaría dólares con euros y daría una
 * cifra sin sentido — y filtrar solo los de USD, como hace sumRevenue() arriba, dejaría fuera a
 * la mayoría de los locales. `totalBs` en cambio ya viene congelado en bolívares en cada pedido,
 * así que siempre es sumable entre restaurantes.
 *
 * El monto en Bs es exacto: son los bolívares que realmente pasaron por la plataforma, cada uno
 * a la tasa que tenía su pedido. El de $ es un equivalente al día de hoy, no lo que valía cada
 * pedido cuando se hizo — al convertir bolívares históricos con la tasa actual, los pedidos
 * viejos quedan subvaluados. Alcanza para una cifra de cabecera; no es un dato contable.
 */
async function sumOrdersAllTime(): Promise<{ usd: string; bs: string }> {
  const { _sum } = await prisma.order.aggregate({
    _sum: { totalBs: true },
    where: { restaurant: { isDemo: false } },
  });
  const totalBs = toDecimal((_sum.totalBs ?? 0) as unknown as string);
  try {
    const { rateBs } = await exchangeRateService.getRate('USD');
    return { usd: bsToBase(totalBs, rateBs).toFixed(2), bs: totalBs.toFixed(2) };
  } catch {
    // Sin tasa BCV cacheada todavía: el monto en Bs igual es válido (no depende de la tasa),
    // solo el equivalente en $ queda en 0 en vez de romper el contador.
    return { usd: '0.00', bs: totalBs.toFixed(2) };
  }
}

export const masterSummaryService = {
  /** Endpoint liviano para el sondeo del contador en vivo: solo un COUNT y un SUM, sin traer
   * filas (get() hace un findMany de todos los pedidos del mes — muy pesado para sondear). */
  async live() {
    const [ordersAllTime, totals] = await Promise.all([countOrdersAllTime(), sumOrdersAllTime()]);
    return { ordersAllTime, ordersAllTimeUsd: totals.usd, ordersAllTimeBs: totals.bs };
  },

  async get() {
    const monthStart = startOfCurrentMonth();

    // La cuenta de demostración (seed-demo.ts, isDemo: true) se excluye de
    // todo el reporte: no es facturación ni actividad real de la plataforma.
    // Las sucursales (parentRestaurantId seteado, ver src/modules/branches/)
    // tampoco son cuentas propias que le pagan a QuickTap por separado —
    // se excluyen igual para no inflar/duplicar restaurantes/dueños.
    const [monthOrders, quickTap, restaurantOwners, totalRestaurants, activeRestaurants, ordersAllTime, allTimeTotals] =
      await Promise.all([
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
        // Valores iniciales del contador en vivo: vienen acá para que la tarjeta pinte de una vez,
        // sin esperar el primer sondeo a /summary/live.
        countOrdersAllTime(),
        sumOrdersAllTime(),
      ]);

    return {
      month: sumRevenue(monthOrders),
      quickTap,
      restaurantOwners,
      totalRestaurants,
      activeRestaurants,
      ordersAllTime,
      ordersAllTimeUsd: allTimeTotals.usd,
      ordersAllTimeBs: allTimeTotals.bs,
    };
  },
};
