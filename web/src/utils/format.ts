import type { Currency, Restaurant } from '../types';

export const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$', EUR: '€' };

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
