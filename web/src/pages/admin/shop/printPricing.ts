/**
 * Cálculo de precio para impresión de gran formato (vinil, banner) — rubro Agencia de
 * Publicidad.
 *
 * La clave del negocio: el material viene en rollos de un ancho fijo (vinil 1,22/1,40/1,52 m;
 * banner 1,06/1,37/1,60/1,84 m) y el sobrante a lo ancho NO se puede reutilizar. Por eso al
 * cliente se le cobra el ANCHO COMPLETO DEL ROLLO por el largo impreso, no la medida que pidió:
 *
 *   un pendón de 1,20 × 0,80 sale del rollo de 1,37  →  1,37 × 0,80 = 1,096 m²  →  × 12 € = 13,15 €
 *
 * Se elige siempre el rollo más angosto en el que la pieza entra, que es el que menos material
 * desperdicia y por lo tanto el más barato para el cliente.
 */

/**
 * Los m² se guardan con 4 decimales, NO con 2. Redondear el área a 2 decimales sobrecobra:
 * 1,37 × 0,80 = 1,096 m², que a 2 decimales sería 1,10 y × 12 € daría 13,20 € en vez de los
 * 13,15 € correctos. El área se mantiene con precisión y el redondeo a céntimos ocurre una
 * sola vez, al final, sobre el importe.
 */
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export interface PrintQuote {
  /** Ancho de rollo del que se corta la pieza, en metros. */
  rollWidth: number;
  /** Largo de material consumido, en metros (el lado que corre a lo largo del rollo). */
  lengthM: number;
  /** Metros cuadrados facturables = rollWidth × lengthM. Es lo que se cobra. */
  billedM2: number;
  /** Metros cuadrados que el cliente realmente pidió (ancho × alto de su pieza). */
  requestedM2: number;
  /** Sobrante de material a lo ancho que no se puede reaprovechar, en m². */
  wasteM2: number;
  /** true si la pieza se acostó (se imprime rotada 90°) para que entrara en un rollo. */
  rotated: boolean;
  /** true si la pieza no entra en ningún rollo ni rotándola — hay que imprimirla por paneles. */
  needsPaneling: boolean;
}

/**
 * Elige el rollo y calcula los m² a facturar de una pieza de `width` × `height` metros.
 *
 * Prueba las dos orientaciones y se queda con la que menos material consume: una pieza de
 * 0,90 × 1,50 entra "de pie" en el rollo de 1,06 (1,06 × 1,50 = 1,59 m²) pero acostada
 * necesitaría el de 1,60 (1,60 × 0,90 = 1,44 m²) — acostarla sale más barato, y es la misma
 * impresión. Devuelve null si falta algún dato para calcular.
 */
export function quotePrint(width: number, height: number, rollWidths: number[]): PrintQuote | null {
  if (!(width > 0) || !(height > 0)) return null;
  const rolls = [...new Set(rollWidths.filter((w) => w > 0))].sort((a, b) => a - b);
  if (rolls.length === 0) return null;

  const requestedM2 = round4(width * height);

  // Cada orientación: qué lado va a lo ancho del rollo y cuál corre a lo largo.
  const options = [
    { across: width, along: height, rotated: false },
    { across: height, along: width, rotated: true },
  ];

  let best: PrintQuote | null = null;
  for (const { across, along, rotated } of options) {
    const roll = rolls.find((w) => w >= across - 1e-9);
    if (roll == null) continue;
    const billedM2 = round4(roll * along);
    if (best && billedM2 >= best.billedM2) continue;
    best = {
      rollWidth: roll,
      lengthM: round4(along),
      billedM2,
      requestedM2,
      wasteM2: round4(billedM2 - requestedM2),
      rotated,
      needsPaneling: false,
    };
  }

  if (best) return best;

  // No entra en ningún rollo ni rotándola: se imprime por paneles y se empalma. Se cotiza sobre
  // el rollo más ancho, dejando la marca para que el vendedor sepa que lleva empalme.
  const widest = rolls[rolls.length - 1];
  const across = Math.min(width, height);
  const along = Math.max(width, height);
  const panels = Math.ceil(across / widest);
  const billedM2 = round4(widest * along * panels);
  return {
    rollWidth: widest,
    lengthM: round4(along),
    billedM2,
    requestedM2,
    wasteM2: round4(billedM2 - requestedM2),
    rotated: height > width,
    needsPaneling: true,
  };
}

/**
 * Costo por m² del material a partir de lo que costó el rollo entero — el dueño compra por
 * rollo, no por metro cuadrado, así que este es el número que de verdad tiene a mano:
 * precio del rollo ÷ (ancho × largo del rollo).
 */
export function costPerM2FromRoll(rollPrice: number, rollWidth: number, rollLengthM: number): number | null {
  const area = rollWidth * rollLengthM;
  if (!(rollPrice > 0) || !(area > 0)) return null;
  return Math.round((rollPrice / area + Number.EPSILON) * 10000) / 10000;
}

/** "1,20 × 0,80 m · rollo 1,37" — el detalle que se guarda en la línea de venta y sale en el recibo. */
export function describePrint(width: number, height: number, quote: PrintQuote): string {
  const n = (v: number) => v.toFixed(2).replace('.', ',');
  const parts = [`${n(width)} × ${n(height)} m`, `rollo ${rollWidthLabel(quote.rollWidth)}`];
  if (quote.rotated) parts.push('rotado');
  if (quote.needsPaneling) parts.push('por paneles');
  return parts.join(' · ');
}

/**
 * Lista de anchos de rollo escrita a mano ("1.06, 1.37, 1.60" o "1,06 1,37 1,60") → números
 * ordenados. No se puede partir por comas: acá la coma es a la vez separador de lista Y
 * separador decimal ("1,06" es un ancho, no dos). Por eso se extraen los números con una
 * expresión regular en vez de dividir el texto, y recién ahí se normaliza la coma decimal.
 */
export function parseRollWidths(raw: string): number[] {
  const tokens = raw.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [
    ...new Set(
      tokens.map((s) => Number(s.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ].sort((a, b) => a - b);
}

/**
 * Etiqueta de un ancho de rollo ("1,37"). Es también el `v1` de la variante que lleva los metros
 * lineales disponibles de ese rollo, así que TODO lo que empareje stock con un ancho tiene que
 * pasar por acá: el descuento al vender resuelve la variante por v1, y si el formato no coincide
 * exacto el stock simplemente no se descontaría (sin error visible).
 */
export function rollWidthLabel(width: number): string {
  return width.toFixed(2).replace('.', ',');
}

/** Inverso de parseRollWidths, para mostrar en el formulario ("1,06 · 1,37 · 1,60"). */
export function formatRollWidths(widths: number[]): string {
  return widths.map(rollWidthLabel).join(' · ');
}
