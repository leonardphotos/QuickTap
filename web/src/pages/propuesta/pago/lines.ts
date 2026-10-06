import { MENU } from '../pedido/data';
import type { PaymentLine } from './PaymentSheet';

export function toPaymentLines(lines: { key: string; productId: string; quantity: number; voided?: boolean }[]): PaymentLine[] {
  return lines
    .filter((l) => !l.voided)
    .flatMap((l) => {
      const product = MENU.find((p) => p.id === l.productId);
      return product ? [{ key: l.key, name: product.name, quantity: l.quantity, amount: product.price * l.quantity }] : [];
    });
}
