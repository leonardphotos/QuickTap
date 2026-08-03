import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';

/** money()/moneyBs() atados a la moneda base y tasa BCV del restaurante logueado. */
export function shopMoneyFormatters(restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>) {
  return {
    money: (n: number) => formatBase(n, restaurant.currencySymbol),
    moneyBs: (n: number) => (restaurant.exchangeRate ? formatBs(n, restaurant.exchangeRate.rateBs) : null),
  };
}

/**
 * Cantidad de stock legible. Las existencias son decimales (Kg, metros de rollo, fracciones de
 * un pote que consume un servicio) y sumar/restar flotantes arrastra error binario: descontar
 * 0,025 tres veces deja 9.924999999999999 en pantalla. Se recorta a 3 decimales y se quitan los
 * ceros sobrantes, así un stock entero sigue viéndose como entero.
 */
export function formatStock(n: number): string {
  return String(Math.round((n + Number.EPSILON) * 1000) / 1000);
}
