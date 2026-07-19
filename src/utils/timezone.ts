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

/** Instante UTC que corresponde a la medianoche de una fecha exacta ("YYYY-MM-DD") en hora de Caracas. */
export function startOfDayCaracas(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0));
}

/** Día de la semana (0=domingo..6=sábado, igual que Date#getDay()) y hora "HH:mm" actuales en Caracas. */
export function nowPartsCaracas(): { dayOfWeek: number; hhmm: string } {
  const shifted = new Date(Date.now() - CARACAS_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { dayOfWeek, hhmm: `${hh}:${mm}` };
}

/** Instante UTC que corresponde a la medianoche del lunes de "esta semana" en hora de Caracas. */
export function startOfWeekCaracas(): Date {
  const shifted = new Date(Date.now() - CARACAS_OFFSET_MS);
  const day = shifted.getUTCDay(); // 0 = domingo
  const diffToMonday = day === 0 ? 6 : day - 1;
  shifted.setUTCDate(shifted.getUTCDate() - diffToMonday);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + CARACAS_OFFSET_MS);
}
