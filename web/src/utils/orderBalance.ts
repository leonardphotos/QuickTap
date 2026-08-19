/** Parte de la cuenta que ya no se debe. El backend (order.service.addPayment y
 * cash-session.service) cuenta como saldado el efectivo/transferencia cobrado MÁS los
 * descuentos y los ajustes de servicio otorgados: los tres perdonan deuda. Si el frontend
 * olvida alguno, un pedido ya cerrado sigue mostrando saldo pendiente ("Debe $X") y el
 * siguiente intento de cobro lo rechaza el servidor con "el monto excede el saldo". */
export interface SettleablePayment {
  amountBase: string | number;
  discountBase?: string | number | null;
  serviceChargeDiscountBase?: string | number | null;
}

export function settledOf(payments: SettleablePayment[]): number {
  return payments.reduce(
    (acc, p) =>
      acc + Number(p.amountBase) + Number(p.discountBase ?? 0) + Number(p.serviceChargeDiscountBase ?? 0),
    0,
  );
}

/** Saldo pendiente de un pedido, nunca negativo. */
export function balanceOfOrder(totalBase: string | number, payments: SettleablePayment[]): number {
  return Math.max(0, Number(totalBase) - settledOf(payments));
}
