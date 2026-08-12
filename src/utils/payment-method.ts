import { PaymentMethod } from '@prisma/client';

export const PAYMENT_METHODS = Object.values(PaymentMethod);

/**
 * La tienda guarda el método de pago como etiqueta suelta (ver STORE_PAYMENT_METHODS en
 * clubStoreApi.ts) en vez del enum, así que hay que traducirlo para poder cuadrarlo con el
 * resto. Lo que no se reconozca queda sin método: entra igual al total —plata que entró es
 * plata que entró— pero no se le carga a ninguna gaveta, porque adivinar cuál descuadraría el
 * arqueo en vez de ayudarlo.
 *
 * Vive acá y no dentro del arqueo porque lo usan DOS consumidores: el cierre de caja
 * (cash-session.service.ts) y el resumen de Administración (club-stats.service.ts). Con una
 * copia en cada sitio, el día que alguien agregue un método a la tienda los dos dirían cosas
 * distintas sobre la misma plata.
 */
const SHOP_METHOD_LABELS: Record<string, PaymentMethod> = {
  'efectivo bs': 'CASH',
  'efectivo $': 'CASH_USD',
  'pago móvil': 'MOBILE_PAYMENT',
  'pago movil': 'MOBILE_PAYMENT',
  'punto de venta': 'CARD',
  zelle: 'ZELLE',
  binance: 'BINANCE',
  paypal: 'PAYPAL',
  transferencia: 'TRANSFER',
};

export function shopMethodToEnum(label: string | null): PaymentMethod | null {
  if (!label) return null;
  return SHOP_METHOD_LABELS[label.trim().toLowerCase()] ?? null;
}

/** Etiquetas para mostrar. Espejo de las del panel (CashSessionControl.tsx). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CARD: 'Punto de venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};
