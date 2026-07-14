/**
 * Venezuela usa UTC-4 todo el año (sin horario de verano), así que un offset
 * fijo basta — no hace falta una librería de zonas horarias para esto.
 */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Instante UTC que corresponde a la medianoche de "hoy" en hora de Caracas. */
export function startOfTodayCaracas(): Date {
  const shifted = new Date(Date.now() - CARACAS_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + CARACAS_OFFSET_MS);
}
