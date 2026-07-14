export type PlanId = 'TRIAL' | 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM' | 'CUSTOM';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL';
export type SubscriptionPaymentMethod = 'PAGO_MOVIL' | 'BINANCE' | 'BANK_TRANSFER';

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: '3 meses',
  SEMIANNUAL: '6 meses',
};

/**
 * Precios fijos por plan y ciclo de facturación (USD/mes). Espejo del cálculo
 * del backend (src/modules/plan-requests/plan-request.service.ts), que es la
 * única fuente de verdad real: aquí solo se usa para mostrar el precio antes
 * de enviar la solicitud.
 */
export const FIXED_PLAN_PRICES: Record<'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM', Record<BillingCycle, number>> = {
  DELIVERY: { MONTHLY: 15, QUARTERLY: 12, SEMIANNUAL: 9 },
  STARTER: { MONTHLY: 20, QUARTERLY: 15, SEMIANNUAL: 10 },
  PRO: { MONTHLY: 35, QUARTERLY: 30, SEMIANNUAL: 25 },
  PREMIUM: { MONTHLY: 50, QUARTERLY: 45, SEMIANNUAL: 40 },
};

// Fórmula del plan personalizado: base + mesas + usuarios (desde el 3ro) + pedidos (por cada 100).
export const CUSTOM_BASE_USD = 10;
export const CUSTOM_PRICE_PER_TABLE = 1;
export const CUSTOM_FREE_USERS = 2;
export const CUSTOM_PRICE_PER_USER = 1.5;
export const CUSTOM_PRICE_PER_100_ORDERS = 2;

export function calculateCustomPriceUsd(tables: number, users: number, orders: number): number {
  const billableUsers = Math.max(0, users - CUSTOM_FREE_USERS);
  const price =
    CUSTOM_BASE_USD +
    tables * CUSTOM_PRICE_PER_TABLE +
    billableUsers * CUSTOM_PRICE_PER_USER +
    (orders / 100) * CUSTOM_PRICE_PER_100_ORDERS;
  return Math.round(price * 100) / 100;
}

export const PAYMENT_METHOD_LABEL: Record<SubscriptionPaymentMethod, string> = {
  PAGO_MOVIL: 'Pago Móvil',
  BINANCE: 'Binance',
  BANK_TRANSFER: 'Transferencia bancaria',
};

/** Forma de `theme`-like JSON que edita el Dashboard maestro (GET/PATCH /payment-methods). */
export interface PlatformPaymentMethods {
  pagoMovil?: { banco?: string; telefono?: string; cedula?: string; titular?: string };
  binance?: { id?: string; correo?: string };
  bankTransfer?: { banco?: string; cuenta?: string; titular?: string; rif?: string };
}

/** Convierte la config guardada en líneas legibles para mostrar en la pasarela de pago. */
export function paymentMethodLines(method: SubscriptionPaymentMethod, config: PlatformPaymentMethods): string[] {
  if (method === 'PAGO_MOVIL') {
    const c = config.pagoMovil ?? {};
    return [
      `Banco: ${c.banco || '(sin configurar)'}`,
      `Teléfono: ${c.telefono || '(sin configurar)'}`,
      `Cédula/RIF: ${c.cedula || '(sin configurar)'}`,
      `Titular: ${c.titular || '(sin configurar)'}`,
    ];
  }
  if (method === 'BINANCE') {
    const c = config.binance ?? {};
    return [`Binance ID: ${c.id || '(sin configurar)'}`, `Correo: ${c.correo || '(sin configurar)'}`];
  }
  const c = config.bankTransfer ?? {};
  return [
    `Banco: ${c.banco || '(sin configurar)'}`,
    `Cuenta: ${c.cuenta || '(sin configurar)'}`,
    `Titular: ${c.titular || '(sin configurar)'}`,
    `RIF: ${c.rif || '(sin configurar)'}`,
  ];
}
