import { startOfDayCaracas, startOfTodayCaracas, startOfWeekCaracas } from './timezone';

export type ReportRange = 'day' | 'week' | 'month' | 'year' | 'all';

/** Ventana de fecha para los filtros de reportes (hora de Caracas para "day"/"week"). */
export function rangeFilter(range: ReportRange): { gte: Date } | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  if (range === 'day') return { gte: startOfTodayCaracas() };
  if (range === 'week') return { gte: startOfWeekCaracas() };
  if (range === 'month') return { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  return { gte: new Date(now.getFullYear(), 0, 1) };
}

/**
 * Igual que `rangeFilter`, pero si viene una fecha exacta ("YYYY-MM-DD") la
 * usa en vez del preset — ese único día completo, hora de Caracas.
 */
export function resolveDateFilter({ range, date }: { range: ReportRange; date?: string }): { gte: Date; lt?: Date } | undefined {
  if (date) {
    const gte = startOfDayCaracas(date);
    return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) };
  }
  return rangeFilter(range);
}
