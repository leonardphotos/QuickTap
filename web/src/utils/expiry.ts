/**
 * Fechas de caducidad de insumos y productos.
 *
 * Se trabajan siempre como texto "YYYY-MM-DD", nunca como Date: una fecha
 * guardada como timestamp UTC se lee un día antes en Venezuela (UTC-4), y un
 * insumo que vence "el 3" aparecería vencido el 2. Comparar cadenas con ese
 * formato ordena igual que comparar fechas, así que no hace falta más.
 */

export type ExpiryStatus = 'EXPIRED' | 'URGENT' | 'SOON' | 'OK';

/** Umbrales en días. URGENT es "esta semana"; SOON, "este mes". */
const URGENT_DAYS = 7;
const SOON_DAYS = 30;

/** Hoy en Caracas como "YYYY-MM-DD" (mismo criterio que el backend). */
export function todayCaracas(): string {
  const d = new Date(Date.now() - 4 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Días que faltan para `dateStr`. Negativo = ya venció. */
export function daysUntil(dateStr: string, today = todayCaracas()): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(dateStr) - toUtc(today)) / 86_400_000);
}

export function expiryStatus(dateStr: string | null | undefined, today = todayCaracas()): ExpiryStatus {
  if (!dateStr) return 'OK';
  const days = daysUntil(dateStr, today);
  if (days < 0) return 'EXPIRED';
  if (days <= URGENT_DAYS) return 'URGENT';
  if (days <= SOON_DAYS) return 'SOON';
  return 'OK';
}

/** "Vencido hace 3 días" / "Vence hoy" / "Vence en 12 días". */
export function expiryLabel(dateStr: string, today = todayCaracas()): string {
  const days = daysUntil(dateStr, today);
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? 'Vencido ayer' : `Vencido hace ${n} días`;
  }
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days} días`;
}

export const EXPIRY_CLASS: Record<ExpiryStatus, string> = {
  EXPIRED: 'bg-red-100 text-red-700',
  URGENT: 'bg-orange-100 text-orange-700',
  SOON: 'bg-amber-100 text-amber-700',
  OK: 'bg-brand-950/[0.06] text-brand-950/50',
};

/** "31 dic 2026" — para mostrar la fecha suelta sin depender de Date. */
export function formatExpiry(dateStr: string): string {
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
