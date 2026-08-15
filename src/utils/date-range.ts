import { startOfDayCaracas, startOfTodayCaracas, startOfWeekCaracas } from './timezone';

export type ReportRange = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Cómo se pide el período de un reporte: un preset (`range`), un día exacto (`date`)
 * o un tramo libre desde–hasta (`from`/`to`, ambos "YYYY-MM-DD" e inclusivos).
 * Prioridad: from/to > date > range.
 */
export interface DateSpec {
  range: ReportRange;
  date?: string;
  from?: string;
  to?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * usa en vez del preset — ese único día completo, hora de Caracas. Si viene un
 * tramo `from`/`to` (uno o ambos), manda sobre todo lo demás: desde el inicio del
 * día `from` hasta el final del día `to`, también en hora de Caracas.
 */
export function resolveDateFilter({ range, date, from, to }: DateSpec): { gte?: Date; lt?: Date } | undefined {
  if (from || to) {
    const filter: { gte?: Date; lt?: Date } = {};
    if (from) filter.gte = startOfDayCaracas(from);
    if (to) filter.lt = new Date(startOfDayCaracas(to).getTime() + DAY_MS);
    return filter;
  }
  if (date) {
    const gte = startOfDayCaracas(date);
    return { gte, lt: new Date(gte.getTime() + DAY_MS) };
  }
  return rangeFilter(range);
}

/** Etiqueta legible del período pedido, para títulos de reportes/exportaciones. */
export function describeDateSpec({ range, date, from, to }: DateSpec): string {
  const fmt = (s: string) => s.split('-').reverse().join('/');
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `desde ${fmt(from)}`;
  if (to) return `hasta ${fmt(to)}`;
  if (date) return fmt(date);
  return { day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año', all: 'Todo' }[range];
}
