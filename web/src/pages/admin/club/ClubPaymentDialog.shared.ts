import type { PaymentMethod } from '@/types';


// Mismas etiquetas y reglas que el cobro de comandas (PaymentDialog.tsx) — es
// literalmente "la misma pasarela de pago de restaurantes" que se pidió.
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
  PAYROLL_DEDUCTION: 'Descuento de nómina',
};
