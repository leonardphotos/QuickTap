import type { Modifier, ModifierCategory } from '@/types';

/** Tope efectivo de selecciones totales de una categoría (ya resuelto server-side si el
 * producto tiene un override). Sin límite explícito: 1 si es de una sola opción, sin tope
 * si permite varias. */
export function effectiveMax(category: ModifierCategory): number {
  if (category.maxSelections != null) return category.maxSelections;
  return category.allowMultiple ? Infinity : 1;
}

/** Mínimo efectivo de selecciones totales de una categoría. isRequired manda: una categoría
 * "Opcional" nunca exige nada, tenga o no un minSelections guardado — ese campo solo afina EL
 * mínimo de una categoría que ya es obligatoria (ej. "elige al menos 2"), no la vuelve
 * obligatoria por sí solo. */
export function effectiveMin(category: ModifierCategory): number {
  if (!category.isRequired) return 0;
  return category.minSelections ?? 1;
}

/** Precio efectivo de un modificador para la variante elegida (ej. "Extra queso" en Pizza
 * Grande vs. Pequeña): si tiene un precio propio para esa variante usa ese, si no cae al
 * priceBase general del modificador. Sin variante elegida (producto de precio simple) siempre
 * usa el priceBase general. */
export function effectiveModifierPrice(modifier: Modifier, variantId?: string | null): number {
  if (variantId) {
    const override = modifier.variantPrices?.find((vp) => vp.variantId === variantId);
    if (override) return Number(override.priceBase);
  }
  return Number(modifier.priceBase);
}
