import type { ModifierCategory } from '@/types';

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
