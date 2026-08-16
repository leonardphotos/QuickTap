import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { resolveDateFilter, type ReportRange } from '../../utils/date-range';
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
 * que ve todo el mundo al entrar.
 */

/** Ventas del período por vertical: el restaurante factura Order; el local, ShopSale. */
async function salesFor(restaurantId: string, businessType: string, range: ReportRange, date?: string) {
  const createdAt = resolveDateFilter({ range, date });
  if (businessType === 'SHOP') {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, returned: false, time: createdAt },
      select: { total: true },
    });
    return {
      count: sales.length,
      totalBase: round2(sales.reduce((acc, s) => acc.add(toDecimal(s.total)), toDecimal(0))),
    };
  }
  const orders = await prisma.order.findMany({
    where: { restaurantId, status: { not: 'CANCELLED' }, createdAt },
    select: { totalBase: true },
  });
  return {
    count: orders.length,
    totalBase: round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))),
  };
}

/** El período inmediatamente anterior del mismo tamaño, para el "vs." de cada KPI. */
function previousRange(range: ReportRange): { range: ReportRange; date?: string } {
  const now = new Date();
  if (range === 'day') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { range: 'day', date: yesterday.toISOString().slice(0, 10) };
  }
  // Semana/mes/año anterior no tienen preset propio: se resuelven con `from`/`to` en el
  // service de abajo. Acá solo se marca que hay que calcularlo aparte.
  return { range };
}

export const kpiService = {
  async getGeneralKpis(restaurantId: string, range: ReportRange = 'month') {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessType: true },
    });
    const businessType = restaurant?.businessType ?? 'RESTAURANT';

    const [sales, prevSales, expenses, breakEven, margin] = await Promise.all([
      salesFor(restaurantId, businessType, range),
      (async () => {
        const prev = previousRange(range);
        if (prev.date) return salesFor(restaurantId, businessType, 'day', prev.date);
        // Para semana/mes/año se compara contra el mismo rango del período anterior usando
        // el filtro de fechas explícito que ya sabe armar resolveDateFilter.
        const now = new Date();
        const start =
          range === 'week'
            ? new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
            : range === 'month'
              ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
              : new Date(now.getFullYear() - 1, 0, 1);
        const end =
          range === 'week'
            ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            : range === 'month'
              ? new Date(now.getFullYear(), now.getMonth(), 1)
              : new Date(now.getFullYear(), 0, 1);
        const rows =
          businessType === 'SHOP'
            ? await prisma.shopSale.findMany({
                where: { restaurantId, returned: false, time: { gte: start, lt: end } },
                select: { total: true },
              })
            : await prisma.order.findMany({
                where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: start, lt: end } },
                select: { totalBase: true },
              });
        const total = rows.reduce(
          (acc: ReturnType<typeof toDecimal>, r: { total?: unknown; totalBase?: unknown }) =>
            acc.add(toDecimal((r.totalBase ?? r.total) as never)),
          toDecimal(0),
        );
        return { count: rows.length, totalBase: round2(total) };
      })(),
      prisma.movement.aggregate({
        where: { restaurantId, type: 'EXPENSE', createdAt: resolveDateFilter({ range }) },
        _sum: { amountBase: true },
      }),
      businessType === 'SHOP' ? shopService.getBreakEven(restaurantId, range) : productService.getBreakEven(restaurantId, range),
      businessType === 'SHOP' ? null : productService.listWithMargin(restaurantId, range),
    ]);

    const expensesBase = round2(toDecimal(expenses._sum.amountBase ?? 0));
    // Costo de lo vendido: en restaurante sale del margen por producto; en local, del costo
    // variable que ya calcula el punto de equilibrio (ShopSaleItem congela su costo).
    const costBase = margin ? round2(toDecimal(margin.summary.costBase)) : round2(toDecimal(breakEven.breakEven.cvBase));
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
