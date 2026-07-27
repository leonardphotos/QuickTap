import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';

/** money()/moneyBs() atados a la moneda base y tasa BCV del restaurante logueado. */
export function shopMoneyFormatters(restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>) {
  return {
    money: (n: number) => formatBase(n, restaurant.currencySymbol),
    moneyBs: (n: number) => (restaurant.exchangeRate ? formatBs(n, restaurant.exchangeRate.rateBs) : null),
  };
}
