const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Compara dos textos tratando los números que contienen como números, no letra por letra —
 * así "Mesa 2" sale antes que "Mesa 10" (con orden alfabético plano, "10" queda antes que "2"
 * porque el carácter "1" es menor que "2"). Table.number es texto libre a propósito (puede ser
 * "Terraza-2"), así que el orden numérico puro no sirve; esto funciona igual de bien con o sin
 * texto alrededor del número.
 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
