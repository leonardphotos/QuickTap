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

/**
 * ¿Este grupo de modificadores se ofrece en el tamaño elegido?
 *
 * `variantIds` vacío o ausente = en todos los tamaños, que es como se comportaba antes de que
 * el grupo pudiera acotarse por variante. Vive acá para que las tres pantallas que arman un
 * pedido (menú público, galería de fotos y el diálogo del panel) decidan igual — y para que
 * coincidan con lo que valida el servidor en priceModifierSelection, que es quien manda.
 */
export function aplicaAlTamano(category: ModifierCategory, variantId?: string | null): boolean {
  if (!category.variantIds || category.variantIds.length === 0) return true;
  return variantId != null && category.variantIds.includes(variantId);
}

/**
 * Igual que aplicaAlTamano pero un nivel más abajo: ¿este MODIFICADOR puntual (no el grupo
 * entero) se ofrece en el tamaño elegido? Un grupo ya visible en esta variante puede seguir
 * acotando modificadores sueltos dentro de él (ej. "Extra tocineta" solo en la Doble/Triple,
 * aunque el resto de "Extras" se vea en las tres).
 */
export function modifierAplicaAlTamano(modifier: Modifier, variantId?: string | null): boolean {
  if (!modifier.variantIds || modifier.variantIds.length === 0) return true;
  return variantId != null && modifier.variantIds.includes(variantId);
}

/**
 * Total a cobrar de UN grupo con sus unidades gratis ya descontadas. `qtyMap` es
 * modifierId → cantidad elegida. Las gratis se asignan a las unidades MÁS BARATAS — la misma
 * regla que congela el servidor (priceModifierSelection), para que el total que se le muestra
 * a quien pide sea exactamente el que después se cobra.
 */
export function totalGrupoConGratis(
  category: ModifierCategory,
  qtyMap: Record<string, number>,
  variantId?: string | null,
): number {
  const unidades: number[] = [];
  for (const m of category.modifiers ?? []) {
    const qty = qtyMap[m.id] ?? 0;
    if (qty <= 0) continue;
    const precio = effectiveModifierPrice(m, variantId);
    for (let i = 0; i < qty; i++) unidades.push(precio);
  }
  unidades.sort((a, b) => a - b);
  const gratis = Math.min(category.freeQuantity ?? 0, unidades.length);
  return unidades.slice(gratis).reduce((acc, p) => acc + p, 0);
}

/**
 * Las líneas elegidas de UN grupo con las gratis ya aplicadas: misma información que el
 * multiset que viaja al backend, pero con el precio unitario que de verdad se cobrará. Si un
 * modificador queda mitad gratis y mitad cobrado, sale en dos líneas (como las congela el
 * servidor) para que el carrito enseñe qué se regaló.
 */
export function lineasConGratis(
  category: ModifierCategory,
  qtyMap: Record<string, number>,
  variantId?: string | null,
): { modifierId: string; name: string; priceBase: number; quantity: number }[] {
  const lineas = (category.modifiers ?? [])
    .filter((m) => (qtyMap[m.id] ?? 0) > 0)
    .map((m) => ({
      modifierId: m.id,
      name: m.name,
      priceBase: effectiveModifierPrice(m, variantId),
      quantity: qtyMap[m.id],
    }));
  let gratis = category.freeQuantity ?? 0;
  if (gratis <= 0) return lineas;
  const resultado: { modifierId: string; name: string; priceBase: number; quantity: number }[] = [];
  // Mismo orden que el servidor: las más baratas primero se vuelven gratis.
  const porPrecio = [...lineas].sort((a, b) => a.priceBase - b.priceBase);
  const libresDe = new Map<string, number>();
  for (const l of porPrecio) {
    if (gratis <= 0) break;
    const libres = Math.min(l.quantity, gratis);
    gratis -= libres;
    libresDe.set(l.modifierId, libres);
  }
  for (const l of lineas) {
    const libres = libresDe.get(l.modifierId) ?? 0;
    if (libres > 0) resultado.push({ ...l, priceBase: 0, quantity: libres });
    if (l.quantity - libres > 0) resultado.push({ ...l, quantity: l.quantity - libres });
  }
  return resultado;
}
