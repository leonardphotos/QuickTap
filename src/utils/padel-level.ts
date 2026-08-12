/**
 * Nivel de pádel: el número manda, la etiqueta acompaña.
 *
 * El sistema guarda 1.0–6.0 (Decimal) porque es lo que permite la consulta de
 * rango que importa —"qué grupos admiten a un 3.5"—, pero un jugador nuevo no
 * sabe qué significa "3.0". La etiqueta traduce ese número a algo que sí
 * entiende, sin convertirse en un segundo dato que se pueda desincronizar: se
 * DERIVA del número, nunca se guarda aparte.
 *
 * Los cortes siguen la convención habitual del pádel: iniciación hasta 2.0,
 * intermedio hasta 3.5, avanzado hasta 5.0, competición de ahí en adelante.
 */
export interface PadelLevelBand {
  min: number;
  max: number;
  label: string;
  short: string;
}

export const PADEL_LEVEL_BANDS: PadelLevelBand[] = [
  { min: 1, max: 2, label: 'Principiante', short: 'Prin' },
  { min: 2.5, max: 3.5, label: 'Intermedio', short: 'Inter' },
  { min: 4, max: 5, label: 'Avanzado', short: 'Avanz' },
  { min: 5.5, max: 6, label: 'Competición', short: 'Comp' },
];

/** Etiqueta de un nivel suelto. */
export function levelLabel(level: number | string | null | undefined): string | null {
  if (level === null || level === undefined || level === '') return null;
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  return PADEL_LEVEL_BANDS.find((b) => n >= b.min && n <= b.max)?.label ?? null;
}

/**
 * Etiqueta de un RANGO (el de un grupo). Si el rango cruza dos bandas se
 * nombran las dos —"Intermedio a Avanzado"—, porque decir solo una sería
 * mentir sobre a quién admite el grupo.
 */
export function levelRangeLabel(min: number | string, max: number | string): string {
  const a = levelLabel(min);
  const b = levelLabel(max);
  if (!a && !b) return '';
  if (!a || !b || a === b) return a ?? b ?? '';
  return `${a} a ${b}`;
}

/** "3.0 · Intermedio" — para mostrar el número sin perder el significado. */
export function levelWithLabel(level: number | string | null | undefined): string | null {
  if (level === null || level === undefined || level === '') return null;
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  const label = levelLabel(n);
  return label ? `${n.toFixed(1)} · ${label}` : n.toFixed(1);
}
