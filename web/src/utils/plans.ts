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

export interface PaymentMethodLine {
  label: string;
  value: string;
  /** Si no hay valor configurado ("sin configurar"), no tiene sentido ofrecer copiarlo. */
  copyable: boolean;
}

/** Convierte la config guardada en líneas (label/value) para mostrar en la pasarela de pago. */
export function paymentMethodLines(
  method: SubscriptionPaymentMethod,
  config: PlatformPaymentMethods,
): PaymentMethodLine[] {
  function line(label: string, raw: string | undefined): PaymentMethodLine {
    return { label, value: raw || '(sin configurar)', copyable: !!raw };
  }

  if (method === 'PAGO_MOVIL') {
    const c = config.pagoMovil ?? {};
    return [
      line('Banco', c.banco),
      line('Teléfono', c.telefono),
      line('Cédula/RIF', c.cedula),
      line('Titular', c.titular),
    ];
  }
  if (method === 'BINANCE') {
    const c = config.binance ?? {};
    return [line('Binance ID', c.id), line('Correo', c.correo)];
  }
  const c = config.bankTransfer ?? {};
  return [line('Banco', c.banco), line('Cuenta', c.cuenta), line('Titular', c.titular), line('RIF', c.rif)];
}
