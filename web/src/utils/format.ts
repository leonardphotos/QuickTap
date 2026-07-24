import type { CartLine, Currency, Restaurant } from '../types';

export const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$', EUR: '€' };

/** Convierte un color hex ("#001B43") a un rgba() con la opacidad indicada. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatBase(value: string | number, symbol: string): string {
  return `${symbol}${Number(value).toFixed(2)}`;
}

export function formatBs(value: string | number, rate: string | number): string {
  const bs = Number(value) * Number(rate);
  return `Bs ${bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatBsAbsolute(bs: string | number): string {
  return `Bs ${Number(bs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Precio para mostrar al público: Bs como primario (lo que el cliente paga),
 * el precio en la moneda base ($/€) como referencia secundaria.
 * Si aún no hay tasa BCV disponible, cae a mostrar solo la moneda base.
 */
export function publicPriceLabel(
  amountBase: string | number,
  restaurant: Pick<Restaurant, 'currencySymbol' | 'exchangeRate'>,
): { primary: string; secondary: string | null } {
  if (!restaurant.exchangeRate) {
    return { primary: formatBase(amountBase, restaurant.currencySymbol), secondary: null };
  }
  return {
    primary: formatBs(amountBase, restaurant.exchangeRate.rateBs),
    secondary: formatBase(amountBase, restaurant.currencySymbol),
  };
}

/**
 * Abrevia el identificador de mesa para el cuadrito pequeño de las tarjetas de pedido
 * (ej: "Terraza-1" -> "T1", "Barra-2" -> "B2"). Números cortos ("5", "12") se dejan igual.
 */
export function abbreviateTableBadge(number: string): string {
  if (number.length <= 3) return number;
  const match = number.match(/^(\D*)(\d+)?/);
  const letters = (match?.[1] ?? '').replace(/[^A-Za-zÁ-Úá-ú]/g, '');
  const digits = match?.[2] ?? '';
  if (letters && digits) return `${letters[0].toUpperCase()}${digits}`;
  if (digits) return digits;
  return number.slice(0, 2).toUpperCase();
}

/** Precio unitario efectivo de una línea del carrito: precio base (o de la variante elegida) + modificadores. */
export function cartLineUnitPrice(line: CartLine): number {
  const variant =
    line.product.pricingMode === 'VARIANTS' ? line.product.variants?.find((v) => v.id === line.variantId) : undefined;
  const base = variant ? Number(variant.priceBase) : Number(line.product.price);
  const modifiersTotal = line.selectedModifiers.reduce((acc, m) => acc + Number(m.priceBase) * (m.quantity ?? 1), 0);
  return base + modifiersTotal;
}

/** Etiqueta de un modificador elegido, con "xN" cuando se repitió la misma opción (ej. "Ketchup x4"). */
export function formatModifierLabel(m: { name: string; quantity?: number }): string {
  return m.quantity && m.quantity > 1 ? `${m.name} x${m.quantity}` : m.name;
}

/** Clave estable para comparar si dos líneas del carrito eligieron exactamente los mismos
 * modificadores CON la misma cantidad cada uno (para saber si dos líneas se pueden fusionar
 * en una sola con la cantidad sumada, ej. dos veces "Ceviche + Ketchup x4" pero no confundirlo
 * con "Ceviche + Ketchup x2"). */
export function modifierSelectionKey(mods: { modifierId: string; quantity: number }[]): string {
  return mods
    .map((m) => `${m.modifierId}:${m.quantity}`)
    .sort()
    .join('|');
}
