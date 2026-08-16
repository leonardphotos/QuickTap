import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { resolveDateFilter, type ReportRange } from '../../utils/date-range';
import { startOfTodayCaracas, startOfWeekCaracas } from '../../utils/timezone';
import { productService } from '../products/product.service';
import { shopService } from '../shop/shop.service';

/**
 * KPIs generales del negocio: las cinco cifras con las que el dueño decide si el día/mes va
 * bien, todas del MISMO período y cada una comparada contra el período anterior equivalente:
 *
 *  1. Ventas          — lo cobrado.
 *  2. Ticket promedio — ventas ÷ tickets: cuánto deja cada cliente.
 *  3. Utilidad neta   — ventas − costo de lo vendido − gastos del período.
 *  4. Food cost %     — costo de lo vendido ÷ ventas: cuánto de cada venta se va en materia prima.
 *  5. Punto de equilibrio — cuánto falta (o cuánto sobra) para cubrir los costos fijos del mes.
 *
 * Vive aparte de Administración porque lo consume el Dashboard, que es la primera pantalla
 * que ve todo el mundo al entrar — y por eso mismo tiene que ser barato: los totales se
 * resuelven con agregaciones en la base, no trayendo las filas del período a Node.
 */

type Window = { gte?: Date; lt?: Date } | undefined;

/** Ventas del período por vertical: el restaurante factura Order; el local, ShopSale. */
async function salesFor(restaurantId: string, businessType: string, window: Window) {
  if (businessType === 'SHOP') {
    const agg = await prisma.shopSale.aggregate({
      where: { restaurantId, returned: false, time: window },
      _sum: { total: true },
      _count: true,
    });
    return { count: agg._count, totalBase: round2(toDecimal(agg._sum.total ?? 0)) };
  }
  const agg = await prisma.order.aggregate({
    where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: window },
    _sum: { totalBase: true },
    _count: true,
  });
  return { count: agg._count, totalBase: round2(toDecimal(agg._sum.totalBase ?? 0)) };
}

/** Ventana del período anterior equivalente, para el "vs." de cada KPI. */
function previousWindow(range: ReportRange): { gte: Date; lt: Date } {
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  if (range === 'day') {
    const start = startOfTodayCaracas();
    return { gte: new Date(start.getTime() - DAY), lt: start };
  }
  if (range === 'week') {
    const start = startOfWeekCaracas();
    return { gte: new Date(start.getTime() - 7 * DAY), lt: start };
  }
  if (range === 'month') {
    return {
      gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      lt: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  return { gte: new Date(now.getFullYear() - 1, 0, 1), lt: new Date(now.getFullYear(), 0, 1) };
}

export const kpiService = {
  async getGeneralKpis(restaurantId: string, range: ReportRange = 'month') {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessType: true },
    });
    const businessType = restaurant?.businessType ?? 'RESTAURANT';

    // Una sola pasada del cálculo pesado: `getBreakEven` ya agrega ventas y costo variable
    // por producto, así que el costo de lo vendido sale de ahí en vez de recorrer los
    // OrderItem del período por segunda vez (antes se llamaba también a listWithMargin).
    const [sales, prevSales, expenses, breakEven] = await Promise.all([
      salesFor(restaurantId, businessType, resolveDateFilter({ range })),
      salesFor(restaurantId, businessType, previousWindow(range)),
      prisma.movement.aggregate({
        where: { restaurantId, type: 'EXPENSE', createdAt: resolveDateFilter({ range }) },
        _sum: { amountBase: true },
      }),
      businessType === 'SHOP'
        ? shopService.getBreakEven(restaurantId, range)
        : productService.getBreakEven(restaurantId, range),
    ]);

    const expensesBase = round2(toDecimal(expenses._sum.amountBase ?? 0));
    // Costo de lo vendido = costo variable del punto de equilibrio: en restaurante son los
    // OrderItem valorados con el costo vivo del producto; en local, el costo congelado en
    // cada ShopSaleItem.
    const costBase = round2(toDecimal(breakEven.breakEven.cvBase));
    const netBase = round2(sales.totalBase.sub(costBase).sub(expensesBase));
    const avgTicket = sales.count > 0 ? round2(sales.totalBase.div(sales.count)) : toDecimal(0);
    const prevAvgTicket = prevSales.count > 0 ? round2(prevSales.totalBase.div(prevSales.count)) : toDecimal(0);
    const foodCostPercent = sales.totalBase.gt(0) ? round2(costBase.div(sales.totalBase).mul(100)) : toDecimal(0);

    /** Variación % contra el período anterior; null cuando no hay con qué comparar. */
    const change = (current: ReturnType<typeof toDecimal>, previous: ReturnType<typeof toDecimal>) =>
      previous.gt(0) ? round2(current.sub(previous).div(previous).mul(100)).toFixed(1) : null;

    return {
      range,
      sales: {
        totalBase: sales.totalBase.toFixed(2),
        count: sales.count,
        previousTotalBase: prevSales.totalBase.toFixed(2),
        changePercent: change(sales.totalBase, prevSales.totalBase),
      },
      avgTicket: {
        base: avgTicket.toFixed(2),
        previousBase: prevAvgTicket.toFixed(2),
        changePercent: change(avgTicket, prevAvgTicket),
      },
      net: {
        base: netBase.toFixed(2),
        costBase: costBase.toFixed(2),
        expensesBase: expensesBase.toFixed(2),
        marginPercent: sales.totalBase.gt(0) ? round2(netBase.div(sales.totalBase).mul(100)).toFixed(1) : null,
      },
      foodCost: {
        percent: foodCostPercent.toFixed(1),
        costBase: costBase.toFixed(2),
      },
      breakEven: {
        targetBase: breakEven.breakEven.breakEvenBase,
        gapBase: breakEven.breakEven.gapBase,
        achieved: breakEven.breakEven.achieved,
        fixedCostsBase: breakEven.fixedCosts.totalBase,
        progressPercent:
          breakEven.breakEven.breakEvenBase && Number(breakEven.breakEven.breakEvenBase) > 0
            ? round2(sales.totalBase.div(toDecimal(breakEven.breakEven.breakEvenBase)).mul(100)).toFixed(1)
            : null,
      },
    };
  },
};
