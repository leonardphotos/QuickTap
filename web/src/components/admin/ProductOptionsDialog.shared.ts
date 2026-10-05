

/** Identidad de una fila del combo: plato+tamaño ("Noodle Bar" en 16OZ y 26OZ son filas distintas). */
export function claveComponente(c: { componentProductId: string; variantId?: string | null }): string {
  return `${c.componentProductId}::${c.variantId ?? ''}`;
}
