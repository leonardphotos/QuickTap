import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { round2, toDecimal } from '../../utils/money';
import { describeDateSpec, resolveDateFilter, type DateSpec } from '../../utils/date-range';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';

/**
 * Estados financieros (Contabilidad): Estado de resultados y Estado de situación financiera
 * con la estructura de las NIIF (NIC 1), armados SOLO con lo que QuickTap ya registra —
 * pedidos, gastos, inventario, cuentas bancarias, cuentas por cobrar/pagar. Es contabilidad
 * de gestión, no un cierre contable: no hay activos fijos ni depreciación (no se registran).
 *
 * Criterios (documentados para que el contador sepa qué está leyendo):
 *  - Ingresos ordinarios = ventas sin IVA (base imponible) + recargo por servicio. El IVA no
 *    es ingreso (es pasivo) y las propinas no son del negocio (pasan al personal).
 *  - Costo de ventas = costo vivo de lo vendido (receta o costo manual del producto). Si el
 *    restaurante no tiene costos cargados, se usan las compras de insumos del período como
 *    aproximación (base de caja) y se dice cuál de las dos se usó.
 *  - Gastos por función (NIC 1 §103): personal (Desarrollo Humano), ventas y distribución,
 *    administración. Las compras de insumos NO van a gastos (son costo de ventas/inventario).
 *  - Otros ingresos = ingresos manuales "otro". Cobros de deudas no se cuentan (la venta ya
 *    se reconoció) y se muestran como memorando.
 *  - ISLR estimado = tasa (parámetro, 34 % por defecto — tarifa máxima Venezuela) × resultado
 *    antes de impuestos, si es positivo. Es una estimación de gestión, no la declaración.
 */

const D = (n: Prisma.Decimal | number | null | undefined) => toDecimal(n ?? 0);
const money = (d: Prisma.Decimal) => round2(d).toFixed(2);
const pct = (part: Prisma.Decimal, base: Prisma.Decimal) => (base.gt(0) ? round2(part.div(base).mul(100)).toFixed(1) : null);

const SELLING_CATEGORIES = ['MARKETING', 'TRANSPORT', 'FUEL'] as const;
const PERSONNEL_CATEGORIES = ['PAYROLL'] as const;
const INVENTORY_CATEGORIES = ['SUPPLIES'] as const;

async function businessTypeOf(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { businessType: true, baseCurrency: true, ivaEnabled: true, name: true },
  });
  return r ?? { businessType: 'RESTAURANT', baseCurrency: 'USD' as const, ivaEnabled: false, name: 'QuickTap' };
}

/** Costo de lo vendido en el período (restaurante/club): costo vivo del producto × cantidad. */
async function costOfGoodsSold(restaurantId: string, createdAt: { gte?: Date; lt?: Date } | undefined) {
  const [items, products, recipeSums] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt } },
      select: { productId: true, quantity: true },
    }),
    prisma.product.findMany({ where: { restaurantId }, select: { id: true, costSource: true, costBase: true } }),
    prisma.recipeIngredient.groupBy({ by: ['productId'], where: { restaurantId }, _sum: { costBase: true } }),
  ]);
  const recipe = new Map(recipeSums.map((r) => [r.productId, D(r._sum.costBase)]));
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = toDecimal(0);
  for (const it of items) {
    const p = it.productId ? byId.get(it.productId) : undefined;
    if (!p) continue;
    const unit = p.costSource === 'RECIPE' ? (recipe.get(p.id) ?? toDecimal(0)) : D(p.costBase);
    total = total.add(unit.mul(it.quantity));
  }
  return round2(total);
}

export const accountingService = {
  async incomeStatement(restaurantId: string, spec: DateSpec, taxRatePercent: number) {
    const restaurant = await businessTypeOf(restaurantId);
    const createdAt = resolveDateFilter(spec);
    const isShop = restaurant.businessType === 'SHOP';

    const [orders, shopSales, expensesByCategory, incomes, cogsProducts] = await Promise.all([
      isShop
        ? null
        : prisma.order.aggregate({
            where: { restaurantId, status: { not: 'CANCELLED' }, createdAt },
            _sum: { subtotalBase: true, serviceChargeBase: true, ivaBase: true, tipBase: true, totalBase: true },
            _count: true,
          }),
      isShop
        ? prisma.shopSale.aggregate({ where: { restaurantId, returned: false, time: createdAt }, _sum: { total: true }, _count: true })
        : null,
      prisma.movement.groupBy({
        by: ['category'],
        where: { restaurantId, type: 'EXPENSE', createdAt },
        _sum: { amountBase: true },
      }),
      prisma.movement.groupBy({
        by: ['incomeCategory'],
        where: { restaurantId, type: 'INCOME', createdAt },
        _sum: { amountBase: true },
      }),
      isShop ? Promise.resolve(toDecimal(0)) : costOfGoodsSold(restaurantId, createdAt),
    ]);

    // --- Ingresos de actividades ordinarias ---
    const salesNet = isShop ? D(shopSales?._sum.total) : D(orders?._sum.subtotalBase);
    const serviceCharge = isShop ? toDecimal(0) : D(orders?._sum.serviceChargeBase);
    const ivaCollected = isShop ? toDecimal(0) : D(orders?._sum.ivaBase);
    const tips = isShop ? toDecimal(0) : D(orders?._sum.tipBase);
    const revenue = round2(salesNet.add(serviceCharge));
    const ordersCount = isShop ? (shopSales?._count ?? 0) : (orders?._count ?? 0);

    // --- Gastos por categoría ---
    const expense = (cats: readonly string[]) =>
      round2(expensesByCategory.filter((g) => g.category && (cats as readonly string[]).includes(g.category)).reduce((a, g) => a.add(D(g._sum.amountBase)), toDecimal(0)));
    const supplies = expense(INVENTORY_CATEGORIES);
    const personnel = expense(PERSONNEL_CATEGORIES);
    const selling = expense(SELLING_CATEGORIES);
    const excluded = new Set<string>([...INVENTORY_CATEGORIES, ...PERSONNEL_CATEGORIES, ...SELLING_CATEGORIES]);
    const admin = round2(
      expensesByCategory.filter((g) => !g.category || !excluded.has(g.category)).reduce((a, g) => a.add(D(g._sum.amountBase)), toDecimal(0)),
    );
    const adminBreakdown = expensesByCategory
      .filter((g) => !g.category || !excluded.has(g.category))
      .map((g) => ({ category: g.category ?? 'OTHER', amountBase: money(D(g._sum.amountBase)) }))
      .sort((a, b) => Number(b.amountBase) - Number(a.amountBase));

    // --- Costo de ventas ---
    const cogsBasis: 'PRODUCT_COST' | 'SUPPLIES' = !isShop && cogsProducts.gt(0) ? 'PRODUCT_COST' : 'SUPPLIES';
    const costOfSales = cogsBasis === 'PRODUCT_COST' ? cogsProducts : supplies;
    const grossProfit = round2(revenue.sub(costOfSales));

    // --- Resultado ---
    const operatingExpenses = round2(personnel.add(selling).add(admin));
    const operatingResult = round2(grossProfit.sub(operatingExpenses));
    const incomeOf = (cat: string | null) => D(incomes.find((i) => (i.incomeCategory ?? null) === cat)?._sum.amountBase);
    const otherIncome = round2(incomeOf('OTHER').add(incomeOf(null)));
    const debtCollections = round2(incomeOf('DEBT'));
    const tipIncome = round2(incomeOf('TIP'));
    const beforeTax = round2(operatingResult.add(otherIncome));
    const rate = Math.min(100, Math.max(0, Number(taxRatePercent) || 0));
    const incomeTax = beforeTax.gt(0) ? round2(beforeTax.mul(rate).div(100)) : toDecimal(0);
    const netResult = round2(beforeTax.sub(incomeTax));

    return {
      period: { label: describeDateSpec(spec), ...spec },
      currency: restaurant.baseCurrency,
      businessType: restaurant.businessType,
      ordersCount,
      revenue: {
        sales: money(salesNet),
        serviceCharge: money(serviceCharge),
        total: money(revenue),
      },
      costOfSales: { amount: money(costOfSales), basis: cogsBasis, suppliesPurchases: money(supplies), productCost: money(cogsProducts) },
      grossProfit: { amount: money(grossProfit), marginPercent: pct(grossProfit, revenue) },
      operatingExpenses: {
        personnel: money(personnel),
        selling: money(selling),
        administrative: money(admin),
        administrativeBreakdown: adminBreakdown,
        total: money(operatingExpenses),
      },
      operatingResult: { amount: money(operatingResult), marginPercent: pct(operatingResult, revenue) },
      otherIncome: money(otherIncome),
      resultBeforeTax: money(beforeTax),
      incomeTax: { ratePercent: rate, amount: money(incomeTax) },
      netResult: { amount: money(netResult), marginPercent: pct(netResult, revenue) },
      memo: {
        ivaCollected: money(ivaCollected),
        tipsCollected: money(tips.add(tipIncome)),
        debtCollections: money(debtCollections),
        ivaEnabled: restaurant.ivaEnabled,
      },
    };
  },

  async balanceSheet(restaurantId: string, taxRatePercent: number) {
    const restaurant = await businessTypeOf(restaurantId);
    const isShop = restaurant.businessType === 'SHOP';
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [banks, rate, awaitingOrders, creditSales, inventory, shopStock, unpaidCredit, ivaDebit, ivaCredit, ytd] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { restaurantId },
        select: { id: true, name: true, currency: true, balance: true, isPettyCash: true, isVault: true },
        orderBy: { name: 'asc' },
      }),
      exchangeRateService.getRate(restaurant.baseCurrency, restaurantId).catch(() => null),
      isShop
        ? Promise.resolve([])
        : prisma.order.findMany({
            where: { restaurantId, awaitingPayment: true, status: { not: 'CANCELLED' } },
            select: { totalBase: true, payments: { select: { amountBase: true } } },
          }),
      isShop
        ? prisma.shopSale.findMany({
            where: { restaurantId, returned: false, creditTerms: { not: null }, settledAt: null },
            select: { total: true, amountPaidNow: true, payments: { select: { amount: true } } },
          })
        : Promise.resolve([]),
      isShop
        ? Promise.resolve([])
        : prisma.inventoryItem.findMany({ where: { restaurantId, locationScope: 'LOCAL' }, select: { quantity: true, pricePerUnitBase: true } }),
      isShop
        ? prisma.shopProductVariant.findMany({ where: { product: { restaurantId } }, select: { stock: true, product: { select: { cost: true } } } })
        : Promise.resolve([]),
      prisma.movement.aggregate({
        where: { restaurantId, type: 'EXPENSE', isCredit: true, creditPaidAt: null },
        _sum: { amountBase: true },
        _count: true,
      }),
      isShop
        ? Promise.resolve(null)
        : prisma.order.aggregate({ where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: monthStart } }, _sum: { ivaBase: true } }),
      prisma.movement.aggregate({ where: { restaurantId, type: 'EXPENSE', createdAt: { gte: monthStart } }, _sum: { ivaBase: true } }),
      this.incomeStatement(restaurantId, { range: 'year' }, taxRatePercent),
    ]);

    // Efectivo y equivalentes: cuentas en moneda base + cuentas en Bs a la tasa vigente.
    const rateBs = rate ? D(rate.rateBs) : null;
    const cashAccounts = banks.map((b) => {
      const inBase = b.currency === 'BS' ? (rateBs && rateBs.gt(0) ? round2(D(b.balance).div(rateBs)) : toDecimal(0)) : round2(D(b.balance));
      return { id: b.id, name: b.name, currency: b.currency, balance: money(D(b.balance)), balanceBase: money(inBase), kind: b.isVault ? 'VAULT' : b.isPettyCash ? 'PETTY_CASH' : 'BANK' };
    });
    const cash = round2(cashAccounts.reduce((a, c) => a.add(toDecimal(c.balanceBase)), toDecimal(0)));

    // Cuentas por cobrar comerciales: lo que los clientes deben (pedidos a crédito / fiados).
    const receivablesOrders = awaitingOrders.reduce((acc, o) => {
      const paid = o.payments.reduce((a, p) => a.add(p.amountBase), toDecimal(0));
      return acc.add(Prisma.Decimal.max(0, D(o.totalBase).sub(paid)));
    }, toDecimal(0));
    const receivablesShop = creditSales.reduce((acc, s) => {
      const paid = toDecimal(s.amountPaidNow ?? 0).add(s.payments.reduce((a, p) => a.add(p.amount), toDecimal(0)));
      return acc.add(Prisma.Decimal.max(0, toDecimal(s.total).sub(paid)));
    }, toDecimal(0));
    const receivables = round2(receivablesOrders.add(receivablesShop));

    // Inventarios al costo.
    const inventoryValue = round2(
      isShop
        ? shopStock.reduce((a, v) => a.add(toDecimal(v.stock).mul(v.product.cost)), toDecimal(0))
        : inventory.reduce((a, i) => a.add(D(i.quantity).mul(D(i.pricePerUnitBase))), toDecimal(0)),
    );

    // IVA del mes: débito (ventas) − crédito (compras). Positivo = por pagar; negativo = a favor.
    const ivaNet = round2(D(ivaDebit?._sum.ivaBase).sub(D(ivaCredit._sum.ivaBase)));
    const ivaPayable = ivaNet.gt(0) ? ivaNet : toDecimal(0);
    const ivaReceivable = ivaNet.lt(0) ? ivaNet.abs() : toDecimal(0);

    const payables = round2(D(unpaidCredit._sum.amountBase));
    // ISLR estimado del ejercicio (pasivo estimado, misma tasa que el estado de resultados).
    const incomeTaxPayable = toDecimal(ytd.incomeTax.amount);

    const currentAssets = round2(cash.add(receivables).add(inventoryValue).add(ivaReceivable));
    const totalAssets = currentAssets; // sin activos no corrientes registrados
    const currentLiabilities = round2(payables.add(ivaPayable).add(incomeTaxPayable));
    const totalLiabilities = currentLiabilities;
    const equity = round2(totalAssets.sub(totalLiabilities));
    const periodResult = toDecimal(ytd.netResult.amount);
    const retained = round2(equity.sub(periodResult));

    return {
      asOf: now.toISOString(),
      currency: restaurant.baseCurrency,
      exchangeRateBs: rateBs ? money(rateBs) : null,
      yearStart: yearStart.toISOString(),
      assets: {
        current: {
          cash: { amount: money(cash), accounts: cashAccounts },
          receivables: { amount: money(receivables), ordersCount: awaitingOrders.length + creditSales.length },
          inventory: money(inventoryValue),
          ivaReceivable: money(ivaReceivable),
          total: money(currentAssets),
        },
        nonCurrent: { total: '0.00', note: 'Propiedad, planta y equipo no se registran en QuickTap.' },
        total: money(totalAssets),
      },
      liabilities: {
        current: {
          payables: { amount: money(payables), count: unpaidCredit._count },
          ivaPayable: money(ivaPayable),
          incomeTaxPayable: { amount: money(incomeTaxPayable), ratePercent: ytd.incomeTax.ratePercent },
          total: money(currentLiabilities),
        },
        nonCurrent: { total: '0.00' },
        total: money(totalLiabilities),
      },
      equity: {
        periodResult: money(periodResult),
        retained: money(retained),
        total: money(equity),
      },
      checks: { balanced: round2(totalAssets).eq(round2(totalLiabilities.add(equity))) },
    };
  },

  /**
   * Análisis de costo (Contabilidad): responde "¿cuánto me costó vender lo que vendí, y
   * cuánto se me fue por el camino?".
   *
   *  - Costo TEÓRICO: lo que las recetas dicen que debió costar lo vendido en el período.
   *  - Costo REAL aproximado: compras de insumos del período (base de caja). No es el costo
   *    contable exacto —para eso haría falta inventario inicial y final del período, que
   *    QuickTap no fotografía— así que se dice explícitamente que es una aproximación.
   *  - Merma registrada: lo que se anotó como perdido (ver módulo Merma). Es la parte de la
   *    desviación que SÍ está explicada.
   *  - Desviación = real − teórico − merma: lo que falta por explicar (compras que aún están
   *    en nevera, robo, porciones más grandes que la receta, precios desactualizados).
   *
   * Además desglosa el costo por categoría de producto y deja el ranking de productos por
   * costo y por margen, que es donde se decide qué plato ajustar.
   */
  async costAnalysis(restaurantId: string, spec: DateSpec) {
    const restaurant = await businessTypeOf(restaurantId);
    const createdAt = resolveDateFilter(spec);

    const [items, products, recipeSums, purchases, waste, orders, config] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt } },
        select: { productId: true, productName: true, variantName: true, quantity: true, lineTotal: true },
      }),
      prisma.product.findMany({
        where: { restaurantId },
        select: { id: true, costSource: true, costBase: true, category: { select: { name: true } } },
      }),
      prisma.recipeIngredient.groupBy({ by: ['productId'], where: { restaurantId }, _sum: { costBase: true } }),
      // Compras de insumos del período = costo real aproximado (base de caja).
      prisma.movement.aggregate({
        where: { restaurantId, type: 'EXPENSE', category: 'SUPPLIES', createdAt },
        _sum: { amountBase: true },
        _count: true,
      }),
      prisma.wasteRecord.aggregate({ where: { restaurantId, occurredAt: createdAt }, _sum: { costBase: true }, _count: true }),
      prisma.order.aggregate({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt },
        _sum: { subtotalBase: true },
        _count: true,
      }),
      prisma.costStructureConfig.findUnique({ where: { restaurantId }, select: { items: true, targetNetMarginPercent: true } }),
    ]);

    const recipeCost = new Map(recipeSums.map((r) => [r.productId, D(r._sum.costBase)]));
    const byId = new Map(products.map((p) => [p.id, p]));
    const unitCostOf = (id: string | null) => {
      const p = id ? byId.get(id) : undefined;
      if (!p) return toDecimal(0);
      return p.costSource === 'RECIPE' ? (recipeCost.get(p.id) ?? toDecimal(0)) : D(p.costBase);
    };

    // --- Agregación por producto y por categoría ---
    type Agg = { name: string; categoryName: string; quantity: number; revenue: Prisma.Decimal; cost: Prisma.Decimal; hasCost: boolean };
    const byProduct = new Map<string, Agg>();
    const byCategory = new Map<string, { revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
    let theoreticalCost = toDecimal(0);
    let revenue = toDecimal(0);
    let revenueWithoutCost = toDecimal(0);

    for (const it of items) {
      const unit = unitCostOf(it.productId);
      const lineCost = unit.mul(it.quantity);
      const name = it.variantName ? `${it.productName} (${it.variantName})` : it.productName;
      const categoryName = (it.productId && byId.get(it.productId)?.category.name) ?? 'Sin categoría';
      const key = `${it.productId ?? `name:${it.productName}`}:${it.variantName ?? ''}`;

      theoreticalCost = theoreticalCost.add(lineCost);
      revenue = revenue.add(it.lineTotal);
      if (unit.lte(0)) revenueWithoutCost = revenueWithoutCost.add(it.lineTotal);

      const cur = byProduct.get(key) ?? { name, categoryName, quantity: 0, revenue: toDecimal(0), cost: toDecimal(0), hasCost: unit.gt(0) };
      cur.quantity += it.quantity;
      cur.revenue = cur.revenue.add(it.lineTotal);
      cur.cost = cur.cost.add(lineCost);
      cur.hasCost = cur.hasCost || unit.gt(0);
      byProduct.set(key, cur);

      const cat = byCategory.get(categoryName) ?? { revenue: toDecimal(0), cost: toDecimal(0) };
      cat.revenue = cat.revenue.add(it.lineTotal);
      cat.cost = cat.cost.add(lineCost);
      byCategory.set(categoryName, cat);
    }

    theoreticalCost = round2(theoreticalCost);
    revenue = round2(revenue);
    const realCost = round2(D(purchases._sum.amountBase));
    const wasteCost = round2(D(waste._sum.costBase));
    const deviation = round2(realCost.sub(theoreticalCost).sub(wasteCost));

    const rows = [...byProduct.values()]
      .map((p) => {
        const margin = round2(p.revenue.sub(p.cost));
        return {
          name: p.name,
          categoryName: p.categoryName,
          quantity: p.quantity,
          revenueBase: money(p.revenue),
          costBase: money(p.cost),
          marginBase: money(margin),
          foodCostPercent: pct(p.cost, p.revenue),
          marginPercent: pct(margin, p.revenue),
          /** Sin costo cargado el food cost sale 0 % y engaña: la pantalla lo marca. */
          hasCost: p.hasCost,
        };
      })
      .sort((a, b) => Number(b.costBase) - Number(a.costBase));

    const categories = [...byCategory.entries()]
      .map(([name, v]) => {
        const margin = round2(v.revenue.sub(v.cost));
        return {
          name,
          revenueBase: money(v.revenue),
          costBase: money(v.cost),
          marginBase: money(margin),
          foodCostPercent: pct(v.cost, v.revenue),
          shareOfCostPercent: pct(v.cost, theoreticalCost),
        };
      })
      .sort((a, b) => Number(b.costBase) - Number(a.costBase));

    // Food cost objetivo de la estructura de costo, para contrastar el real del período.
    const cfgItems = Array.isArray(config?.items)
      ? (config!.items as unknown as { id: string; kind: string; percent: number; enabled: boolean }[])
      : [];
    const budgetedWaste = cfgItems.find((i) => i.id === 'waste' && i.enabled);

    return {
      period: { label: describeDateSpec(spec), ...spec },
      currency: restaurant.baseCurrency,
      ordersCount: orders._count,
      revenueBase: money(revenue),
      theoretical: { costBase: money(theoreticalCost), foodCostPercent: pct(theoreticalCost, revenue) },
      real: { costBase: money(realCost), purchases: purchases._count, foodCostPercent: pct(realCost, revenue) },
      waste: {
        costBase: money(wasteCost),
        records: waste._count,
        percentOfSales: pct(wasteCost, revenue),
        budgetedPercent: budgetedWaste ? Number(budgetedWaste.percent).toFixed(2) : null,
      },
      deviation: {
        amountBase: money(deviation),
        percentOfSales: pct(deviation.abs(), revenue),
        /** Positiva = compraste más de lo que la receta consumió (queda en inventario o se perdió sin registrar). */
        direction: deviation.gt(0) ? ('OVER' as const) : deviation.lt(0) ? ('UNDER' as const) : ('EVEN' as const),
      },
      coverage: {
        revenueWithoutCostBase: money(round2(revenueWithoutCost)),
        percentWithoutCost: pct(round2(revenueWithoutCost), revenue),
      },
      categories,
      rows,
    };
  },
};
