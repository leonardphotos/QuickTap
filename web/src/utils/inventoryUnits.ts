/**
 * Unidades de inventario y sus sub-unidades, compartidas entre Inventario
 * (recetas de producto) y el editor de modificadores. Vivían duplicadas en
 * InventoryPage.tsx; se extrajeron acá cuando el editor de modificadores
 * necesitó exactamente la misma conversión.
 */

export const UNIT_LABELS: Record<string, string> = { kg: 'Kg', lt: 'Lt', ml: 'Ml', unidad: 'Und' };

export interface SubUnit {
  value: string;
  label: string;
  /** Factor para pasar de esta sub-unidad a la unidad base del insumo. */
  toBase: number;
}

/** Sub-unidades para cargar el consumo en algo más chico que la unidad del insumo. */
export const SUB_UNITS: Record<string, SubUnit[]> = {
  kg: [
    { value: 'kg', label: 'Kg', toBase: 1 },
    { value: 'gr', label: 'Gr', toBase: 0.001 },
  ],
  lt: [
    { value: 'lt', label: 'Lt', toBase: 1 },
    { value: 'ml', label: 'Ml', toBase: 0.001 },
  ],
  ml: [{ value: 'ml', label: 'Ml', toBase: 1 }],
  unidad: [{ value: 'unidad', label: 'Und', toBase: 1 }],
};

export function subUnitsFor(unit: string | null | undefined): SubUnit[] {
  return SUB_UNITS[unit ?? ''] ?? SUB_UNITS.unidad;
}

/**
 * Elige cómo mostrar una cantidad guardada en unidad base: si es menor a 1 y la
 * unidad admite sub-unidad (kg->gr, lt->ml), la muestra en la sub-unidad para
 * que "0.03 kg" se lea como "30 gr".
 */
export function formatBaseQuantity(baseQuantity: number, unit: string | null | undefined): string {
  const options = subUnitsFor(unit);
  const small = options.find((o) => o.toBase < 1);
  if (small && baseQuantity > 0 && baseQuantity < 1) {
    const converted = baseQuantity / small.toBase;
    return `${Number(converted.toFixed(2))} ${small.label}`;
  }
  const base = options.find((o) => o.toBase === 1) ?? options[0];
  return `${Number(baseQuantity.toFixed(3))} ${base.label}`;
}
