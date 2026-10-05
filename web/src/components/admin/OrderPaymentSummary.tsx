import { formatBase } from '@/utils/format';
import { getPaymentStatus, type LiveOrder } from './LiveOrdersPanel.shared';

/** Distingue dinero recibido de descuentos: ambos reducen deuda, solo uno es un abono. */
export function OrderPaymentSummary({ order, symbol }: { order: LiveOrder; symbol: string }) {
  const { balanceBase } = getPaymentStatus(order);
  const received = order.payments.reduce((sum, payment) => sum + Number(payment.amountBase), 0);
  const discounts = order.payments.reduce((sum, payment) => sum + Number(payment.discountBase ?? 0) + Number(payment.serviceChargeDiscountBase ?? 0), 0);
  const refund = Number(order.correctionBalance?.pendingRefundBase ?? 0);
  if (!order.payments.length && !order.correctionBalance) return null;
  return <section aria-label="Estado de pago del pedido" aria-live="polite" className="rounded-xl border border-brand-950/10 bg-brand-950/[0.025] px-3 py-3 text-sm tabular-nums">
    <dl className="space-y-2">
      <div className="flex justify-between gap-3 text-brand-950/65"><dt>Total del pedido</dt><dd>{formatBase(order.totalBase, symbol)}</dd></div>
      <div className="flex justify-between gap-3 text-emerald-700"><dt>Pagado</dt><dd>{formatBase(received, symbol)}</dd></div>
      {discounts > 0 && <div className="flex justify-between gap-3 text-brand-950/65"><dt>Descuentos y ajustes</dt><dd>{formatBase(discounts, symbol)}</dd></div>}
      <div className={`flex justify-between gap-3 border-t border-brand-950/10 pt-2 font-semibold ${balanceBase > 0.01 ? 'text-amber-800' : 'text-emerald-700'}`}><dt>Saldo pendiente</dt><dd>{formatBase(balanceBase, symbol)}</dd></div>
      {refund > 0.01 && <div className="flex justify-between gap-3 font-semibold text-amber-800"><dt>Pendiente por devolver</dt><dd>{formatBase(refund, symbol)}</dd></div>}
    </dl>
  </section>;
}
