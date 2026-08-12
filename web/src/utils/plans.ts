export type PlanId =
  | 'TRIAL'
  | 'DELIVERY'
  | 'STARTER'
  | 'PRO'
  | 'PREMIUM'
  | 'CUSTOM'
  | 'SUCURSALES'
  | 'DELIVERY_SUCURSALES'
  | 'ELITE'
  | 'SHOP';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL';
export type SubscriptionPaymentMethod = 'PAGO_MOVIL' | 'BINANCE' | 'BANK_TRANSFER';

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: '3 meses',
  SEMIANNUAL: '6 meses',
};

export type PurchasablePlan = 'DELIVERY' | 'PRO' | 'ELITE' | 'SHOP';

/**
 * Precios fijos por plan y ciclo de facturación (USD/mes). Espejo del cálculo
 * del backend (src/modules/plan-requests/plan-request.service.ts), que es la
 * única fuente de verdad real: aquí solo se usa para mostrar el precio antes
 * de enviar la solicitud. Tres planes vigentes de Restaurante: Delivery, Pro y
 * Elite, los tres con sucursales ilimitadas (ver allowsBranches en
 * utils/subscription.ts). SHOP es el único plan de Locales Comerciales.
 */
export const FIXED_PLAN_PRICES: Record<PurchasablePlan, Record<BillingCycle, number>> = {
  DELIVERY: { MONTHLY: 24.99, QUARTERLY: 22.74, SEMIANNUAL: 20.49 },
  PRO: { MONTHLY: 29.99, QUARTERLY: 26.99, SEMIANNUAL: 23.99 },
  ELITE: { MONTHLY: 39.99, QUARTERLY: 35.49, SEMIANNUAL: 30.99 },
  SHOP: { MONTHLY: 20, QUARTERLY: 18, SEMIANNUAL: 16 },
};

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
  /** Interruptores globales de la pasarela: si alguno está apagado, PaymentForm oculta esa opción. */
  ramblayEnabled?: boolean;
  manualPaymentEnabled?: boolean;
  /** Botones "Mejorar con IA" / "Fondo blanco con IA" en Restaurantes y Locales (ai-photo-service). */
  aiPhotoEnabled?: boolean;
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
