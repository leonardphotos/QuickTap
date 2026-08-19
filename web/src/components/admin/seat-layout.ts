/**
 * Dónde va cada silla alrededor de una mesa del plano.
 *
 * Devuelve desplazamientos en píxeles respecto al CENTRO de la mesa, así que quien dibuja solo
 * tiene que sumarlos a su propio centro. Es una función pura (sin React, sin DOM) para poder
 * razonarla y probarla sola.
 */

export type TableShape = 'ROUND' | 'SQUARE' | 'RECTANGLE';

export interface SeatOffset {
  x: number;
  y: number;
}

/**
 * Reparte `total` sillas entre los cuatro lados de un rectángulo, proporcional al largo de
 * cada lado, pero garantizando al menos una por lado mientras alcancen. Con `w = 2h` (la mesa
 * rectangular de 6) da 2 arriba, 2 abajo, 1 a cada extremo — que es como se sienta la gente.
 *
 * Orden del resultado: [arriba, derecha, abajo, izquierda].
 */
function splitAcrossSides(total: number, width: number, height: number): [number, number, number, number] {
  // Con 4 sillas o menos, una por lado se lee mejor que amontonarlas en los lados largos.
  if (total <= 4) {
    const order: [number, number, number, number] = [0, 0, 0, 0];
    const sequence = [0, 2, 1, 3]; // arriba, abajo, derecha, izquierda
    for (let i = 0; i < total; i += 1) order[sequence[i]] += 1;
    return order;
  }

  const perimeter = 2 * (width + height);
  const raw = [width, height, width, height].map((side) => (total * side) / perimeter);
  const counts = raw.map((n) => Math.max(1, Math.floor(n)));

  // Reparte lo que sobró (o quita lo que se pasó) al lado con mayor resto, sin bajar de 1.
  let diff = total - counts.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((n, i) => ({ i, rest: n - Math.floor(n) })).sort((a, b) => b.rest - a.rest);
  let cursor = 0;
  while (diff !== 0) {
    const { i } = byRemainder[cursor % 4];
    if (diff > 0) {
      counts[i] += 1;
      diff -= 1;
    } else if (counts[i] > 1) {
      counts[i] -= 1;
      diff += 1;
    }
    cursor += 1;
    // Red de seguridad: si todos los lados están en 1 y todavía sobra por quitar, se corta.
    if (cursor > 64) break;
  }

  return counts as [number, number, number, number];
}

/** Reparte `n` puntos a lo largo de un segmento, con márgenes iguales en los extremos. */
function spread(n: number, length: number): number[] {
  if (n <= 0) return [];
  const step = length / n;
  return Array.from({ length: n }, (_, i) => -length / 2 + step * (i + 0.5));
}

/**
 * Posición de cada silla respecto al centro de la mesa.
 *
 * @param gap separación entre el borde de la mesa y el centro de la silla.
 */
export function seatOffsets(
  shape: TableShape,
  seats: number,
  width: number,
  height: number,
  gap = 9,
): SeatOffset[] {
  const total = Math.max(0, Math.floor(seats));
  if (total === 0) return [];

  // Redonda: repartidas parejo por el contorno, empezando arriba.
  if (shape === 'ROUND') {
    const radius = width / 2 + gap;
    return Array.from({ length: total }, (_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / total;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }

  const [top, right, bottom, left] = splitAcrossSides(total, width, height);
  const halfW = width / 2 + gap;
  const halfH = height / 2 + gap;

  return [
    ...spread(top, width).map((x) => ({ x, y: -halfH })),
    ...spread(right, height).map((y) => ({ x: halfW, y })),
    ...spread(bottom, width).map((x) => ({ x, y: halfH })),
    ...spread(left, height).map((y) => ({ x: -halfW, y })),
  ];
}
