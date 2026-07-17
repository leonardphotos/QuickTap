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
  DELIVERY: { MONTHLY: 22, QUARTERLY: 17.6, SEMIANNUAL: 13.2 },
  STARTER: { MONTHLY: 25, QUARTERLY: 18.75, SEMIANNUAL: 12.5 },
  PRO: { MONTHLY: 43.75, QUARTERLY: 37.5, SEMIANNUAL: 31.25 },
  PREMIUM: { MONTHLY: 62.5, QUARTERLY: 56.25, SEMIANNUAL: 50 },
};

// Fórmula del plan personalizado: base + mesas + usuarios (desde el 3ro) + pedidos
// (por cada 100) + adicionales (Administración/Inventario/Cuentas por pagar).
export const CUSTOM_BASE_USD = 12.5;
export const CUSTOM_PRICE_PER_TABLE = 1.25;
export const CUSTOM_FREE_USERS = 2;
export const CUSTOM_PRICE_PER_USER = 1.88;
export const CUSTOM_PRICE_PER_100_ORDERS = 2.5;

export const CUSTOM_ADDON_PRICES = {
  administration: 8,
  inventoryBasic: 5,
  inventoryRecipe: 12,
  accountsPayable: 4,
} as const;

export interface CustomAddons {
  administration?: boolean;
  inventoryBasic?: boolean;
  inventoryRecipe?: boolean;
  accountsPayable?: boolean;
}

export function calculateCustomPriceUsd(tables: number, users: number, orders: number, addons: CustomAddons = {}): number {
  const billableUsers = Math.max(0, users - CUSTOM_FREE_USERS);
  const addonsTotal =
    (addons.administration ? CUSTOM_ADDON_PRICES.administration : 0) +
    (addons.inventoryBasic ? CUSTOM_ADDON_PRICES.inventoryBasic : 0) +
    (addons.inventoryRecipe ? CUSTOM_ADDON_PRICES.inventoryRecipe : 0) +
    (addons.accountsPayable ? CUSTOM_ADDON_PRICES.accountsPayable : 0);
  const price =
    CUSTOM_BASE_USD +
    tables * CUSTOM_PRICE_PER_TABLE +
    billableUsers * CUSTOM_PRICE_PER_USER +
    (orders / 100) * CUSTOM_PRICE_PER_100_ORDERS +
    addonsTotal;
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
