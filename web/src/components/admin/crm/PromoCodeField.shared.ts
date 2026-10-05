

/** Lo que devuelve /promotions/validate: el descuento que otorga el código. */
export interface AppliedPromo {
  id: string;
  name: string;
  code: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: string;
  customerName: string | null;
}


/** El descuento de la promo sobre un saldo, espejo de promotionDiscountOf del backend. */
export function promoDiscountAmount(promo: AppliedPromo, baseAmount: number): number {
  const raw =
    promo.discountType === 'PERCENT' ? (baseAmount * Number(promo.discountValue)) / 100 : Number(promo.discountValue);
  return Math.min(Math.round((raw + Number.EPSILON) * 100) / 100, baseAmount);
}
