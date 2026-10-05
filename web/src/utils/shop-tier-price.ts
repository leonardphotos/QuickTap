export type PriceTier = { minQty: number; price: number };
/** El mayor umbral alcanzado fija el precio de TODA la línea, no solo del excedente. */
export function shopTierPrice(product: { price: number; promoPrice?: number | null; wholesalePrice?: number | null; wholesaleMinQty?: number | null; priceTiers?: unknown }, qty: number): number {
  if (product.promoPrice != null) return product.promoPrice;
  let price = product.price;
  let threshold = -1;
  if (product.wholesalePrice != null && product.wholesaleMinQty != null && qty >= product.wholesaleMinQty) {
    price = product.wholesalePrice; threshold = product.wholesaleMinQty;
  }
  for (const tier of (Array.isArray(product.priceTiers) ? product.priceTiers : []) as PriceTier[]) {
    if (qty >= tier.minQty && tier.minQty >= threshold) { price = tier.price; threshold = tier.minQty; }
  }
  return price;
}
