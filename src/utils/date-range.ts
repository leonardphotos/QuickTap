import { startOfTodayCaracas, startOfWeekCaracas } from './timezone';

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
