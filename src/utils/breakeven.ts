import { DecimalLike, round2, toDecimal } from './money';

/**
 * Punto de equilibrio, compartido por las 3 verticales (Restaurante, Locales
 * Comerciales, Club). Cada vertical vende de forma completamente distinta —
 * Order/OrderItem en restaurantes, ShopSale/ShopSaleItem en locales, y una
 * mezcla de ClubBookingPayment/ShopSale/ClubAcademyPayment en clubes — así que
 * cada una arma sus propios `salesBase`/`cvBase`/`fixedCostsBase` (ver
 * product.service.ts#getBreakEven, shop.service.ts#getBreakEven,
 * club-stats.service.ts#breakEven). Esta es la única matemática, para que las
 * 3 devuelvan exactamente la misma forma y el frontend use un solo componente
 * (BreakEvenCard.tsx).
 *
 *   %MC = (Ventas − CV) / Ventas
 *   PE  = CF / %MC
 */

export interface BreakEvenInput {
  /** Ventas del período (mes calendario). */
  salesBase: DecimalLike;
  /** Costo variable de lo efectivamente vendido en el período (no compras de inventario). */
  cvBase: DecimalLike;
  /** Gastos fijos del período (Movement con isRecurring=true). */
  fixedCostsBase: DecimalLike;
  /** Primer día del mes que se está calculando. */
  periodStart: Date;
  /** Inyectable para pruebas — default `new Date()`. */
  now?: Date;
}

export interface BreakEvenResult {
  salesBase: string;
  cvBase: string;
  contributionMarginBase: string;
  /** null solo si no hubo ventas en el período (división por cero). */
  contributionMarginPercent: string | null;
  fixedCostsBase: string;
  /**
   * null cuando %MC <= 0 (se vende en promedio a pérdida, o no hubo ventas):
   * no hay ningún nivel de ventas que cubra los costos fijos, así que no se
   * devuelve una cifra falsa — la UI debe mostrar un aviso, no Infinity/NaN.
   */
  breakEvenBase: string | null;
  /** breakEvenBase − salesBase. Negativo = ya se cubrió. null si breakEvenBase es null. */
  gapBase: string | null;
  /** Ventas del período ya alcanzaron o superaron el punto de equilibrio. */
  achieved: boolean;
  daysElapsed: number;
  daysInPeriod: number;
  /** Ventas ÷ días transcurridos. */
  paceBase: string;
  /** Proyección lineal a fin de mes al ritmo actual. */
  projectedBase: string;
  /** projectedBase × %MC − CF. null si %MC es null. */
  projectedProfitBase: string | null;
  /** Proyección de fin de mes alcanza el punto de equilibrio. false si breakEvenBase es null. */
  onTrackToBreakEven: boolean;
}

function daysInMonth(periodStart: Date): number {
  return new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
}

/** Día del mes "hoy" dentro del período que se está calculando. Si `now` cae en un mes
 * distinto (se está viendo un mes ya cerrado), se toma el mes completo como transcurrido. */
function dayOfMonth(now: Date, periodStart: Date): number {
  if (now.getFullYear() !== periodStart.getFullYear() || now.getMonth() !== periodStart.getMonth()) {
    return daysInMonth(periodStart);
  }
  return now.getDate();
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const sales = toDecimal(input.salesBase);
  const cv = toDecimal(input.cvBase);
  const cf = toDecimal(input.fixedCostsBase);
  const now = input.now ?? new Date();

  const mc = sales.sub(cv);
  const mcPercent = sales.greaterThan(0) ? mc.div(sales) : null;

  const breakEven = mcPercent && mcPercent.greaterThan(0) ? cf.div(mcPercent) : null;
  const gap = breakEven ? breakEven.sub(sales) : null;
  const achieved = breakEven ? sales.greaterThanOrEqualTo(breakEven) : false;

  const daysInPeriod = daysInMonth(input.periodStart);
  const daysElapsed = Math.min(daysInPeriod, Math.max(1, dayOfMonth(now, input.periodStart)));
  const pace = sales.div(daysElapsed);
  const projected = sales.add(pace.mul(daysInPeriod - daysElapsed));
  const projectedProfit = mcPercent ? round2(projected.mul(mcPercent).sub(cf)) : null;
  const onTrackToBreakEven = breakEven ? projected.greaterThanOrEqualTo(breakEven) : false;

  return {
    salesBase: round2(sales).toFixed(2),
    cvBase: round2(cv).toFixed(2),
    contributionMarginBase: round2(mc).toFixed(2),
    contributionMarginPercent: mcPercent ? round2(mcPercent.mul(100)).toFixed(1) : null,
    fixedCostsBase: round2(cf).toFixed(2),
    breakEvenBase: breakEven ? round2(breakEven).toFixed(2) : null,
    gapBase: gap ? round2(gap).toFixed(2) : null,
    achieved,
    daysElapsed,
    daysInPeriod,
    paceBase: round2(pace).toFixed(2),
    projectedBase: round2(projected).toFixed(2),
    projectedProfitBase: projectedProfit ? projectedProfit.toFixed(2) : null,
    onTrackToBreakEven,
  };
}

/** Una categoría de gasto fijo agregada — ver movementService.summarizeFixedCosts. */
export interface FixedCostCategory {
  category: string;
  amountBase: string;
}

/** Forma común de respuesta de los 3 endpoints (`/products/breakeven`, `/shop/breakeven`,
 * `/club/stats/breakeven`) — lo que permite un solo BreakEvenCard en el frontend. */
export interface BreakEvenResponse {
  period: { label: string; start: string; end: string };
  fixedCosts: { totalBase: string; byCategory: FixedCostCategory[] };
  breakEven: BreakEvenResult;
}

/** Nombre del mes ("Agosto 2026") para el encabezado de la tarjeta. */
export function monthLabel(periodStart: Date): string {
  return periodStart
    .toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
    .replace(/^\p{L}/u, (c) => c.toUpperCase());
}
