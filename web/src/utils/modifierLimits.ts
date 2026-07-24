import type { ModifierCategory } from '@/types';

/** Tope efectivo de selecciones totales de una categoría (ya resuelto server-side si el
 * producto tiene un override). Sin límite explícito: 1 si es de una sola opción, sin tope
 * si permite varias. */
export function effectiveMax(category: ModifierCategory): number {
  if (category.maxSelections != null) return category.maxSelections;
  return category.allowMultiple ? Infinity : 1;
}

/** Mínimo efectivo de selecciones totales de una categoría. Sin mínimo explícito: 1 si es
 * obligatoria, 0 si no. */
export function effectiveMin(category: ModifierCategory): number {
  if (category.minSelections != null) return category.minSelections;
  return category.isRequired ? 1 : 0;
}
