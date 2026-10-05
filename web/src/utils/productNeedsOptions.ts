import type { Product } from '@/types';

/** Los combos conservan su selección de platos y extras antes de agregarse. */
export function productNeedsOptions(product: Product): boolean {
  return product.pricingMode === 'VARIANTS'
    || Boolean(product.modifierCategories?.some(category => category.modifiers.length > 0))
    || Boolean(product.comboComponents?.length);
}
