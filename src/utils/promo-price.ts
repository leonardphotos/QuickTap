import { Prisma } from '@prisma/client';
import { round2 } from './money';
import { nowPartsCaracas, startOfDayCaracas } from './timezone';

/** Subconjunto de Product con los campos de promoción por tiempo (ver prisma/schema.prisma). */
export interface PromoPriceProduct {
  price: Prisma.Decimal | number | string;
  promoPriceEnabled: boolean;
  promoPrice: Prisma.Decimal | number | string | null;
  promoStartTime: string | null;
  promoEndTime: string | null;
  promoDaysOfWeek: number[];
  promoStartDate: Date | null;
  promoEndDate: Date | null;
}

// Venezuela: UTC-4 fijo todo el año, igual que src/utils/timezone.ts.
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/** "YYYY-MM-DD" en hora de Caracas del instante dado. */
function dateKeyCaracas(instant: Date): string {
  const shifted = new Date(instant.getTime() - CARACAS_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ¿La promoción por tiempo de este producto está activa en `now` (default: ahora)? */
export function isPromoPriceActive(product: PromoPriceProduct, now: Date = new Date()): boolean {
  if (!product.promoPriceEnabled || product.promoPrice == null) return false;

  const todayKey = dateKeyCaracas(now);
  if (product.promoStartDate && startOfDayCaracas(todayKey) < startOfDayCaracas(dateKeyCaracas(product.promoStartDate))) {
    return false;
  }
  if (product.promoEndDate && startOfDayCaracas(todayKey) > startOfDayCaracas(dateKeyCaracas(product.promoEndDate))) {
    return false;
  }

  if (product.promoDaysOfWeek && product.promoDaysOfWeek.length > 0) {
    const { dayOfWeek } = nowPartsCaracas();
    if (!product.promoDaysOfWeek.includes(dayOfWeek)) return false;
  }

  if (product.promoStartTime && product.promoEndTime) {
    const { hhmm } = nowPartsCaracas();
    const { promoStartTime: start, promoEndTime: end } = product;
    const crossesMidnight = end < start;
    const inRange = crossesMidnight ? hhmm >= start || hhmm < end : hhmm >= start && hhmm < end;
    if (!inRange) return false;
  }

  return true;
}

/** Precio efectivo AHORA: el de promoción si está activa, si no el normal. Redondeado a 2 decimales. */
export function effectiveProductPrice(product: PromoPriceProduct, now: Date = new Date()): Prisma.Decimal {
  if (isPromoPriceActive(product, now)) return round2(product.promoPrice!);
  return round2(product.price);
}
