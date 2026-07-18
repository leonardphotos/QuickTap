import { Currency, Prisma } from '@prisma/client';

/** Símbolo a mostrar para cada moneda base soportada. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
};

/**
 * Utilidades monetarias. Trabajamos con `Prisma.Decimal` para evitar los
 * errores de coma flotante típicos de `number` en cálculos de dinero.
 */

export type DecimalLike = Prisma.Decimal | number | string;

export function toDecimal(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Redondea a 2 decimales (centavos). */
export function round2(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Convierte un monto en la moneda base (USD/EUR) a Bolívares aplicando la
 * tasa BCV vigente. Resultado redondeado a 2 decimales.
 */
export function baseToBs(amountBase: DecimalLike, exchangeRate: DecimalLike): Prisma.Decimal {
  return toDecimal(amountBase).mul(toDecimal(exchangeRate)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Convierte un monto en Bolívares a la moneda base (USD/EUR) aplicando la tasa BCV vigente. */
export function bsToBase(amountBs: DecimalLike, exchangeRate: DecimalLike): Prisma.Decimal {
  return toDecimal(amountBs).div(toDecimal(exchangeRate)).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/** Formatea un monto como string con símbolo. Ej: formatMoney(12.5, '$') => "$12.50" */
export function formatMoney(value: DecimalLike, symbol = '$'): string {
  return `${symbol}${round2(value).toFixed(2)}`;
}

/** Formatea Bolívares con separador de miles al estilo local (1.234,56). */
export function formatBs(value: DecimalLike): string {
  const fixed = round2(value).toFixed(2); // "1234.56"
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Bs ${withThousands},${decPart}`;
}
