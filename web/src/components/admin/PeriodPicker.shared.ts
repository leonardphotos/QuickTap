

export type PeriodMode = 'day' | 'week' | 'month' | 'custom';


export interface Period {
  mode: PeriodMode;
  /** Fecha ancla ("YYYY-MM-DD"). En 'day' es el día; en 'week'/'month', un día cualquiera dentro. */
  anchor: string;
  /** Solo en 'custom'. */
  from: string;
  to: string;
}


/** "YYYY-MM-DD" de una fecha local, sin pasar por UTC (que corre el día en Venezuela). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


/** Parseo manual: `new Date("2026-09-02")` se interpreta como UTC y en Caracas cae un día antes. */
export function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}


export function periodoDeHoy(mode: PeriodMode = 'month'): Period {
  const hoy = isoLocal(new Date());
  return { mode, anchor: hoy, from: hoy, to: hoy };
}


/** Lunes a domingo, igual que startOfWeekCaracas en el backend. */
export function semanaDe(ancla: Date): { desde: Date; hasta: Date } {
  const d = new Date(ancla);
  const dow = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const fin = new Date(d);
  fin.setDate(fin.getDate() + 6);
  return { desde: d, hasta: fin };
}


/**
 * Traduce el período a los parámetros que entiende el backend (ver resolveDateFilter).
 *
 * Todo sale como `from`/`to` — incluso un solo día — en vez de usar los presets `range`:
 * los presets son siempre relativos a HOY ("esta semana"), y acá se puede elegir CUÁL semana.
 */
export function periodParams(p: Period): { from?: string; to?: string } {
  if (p.mode === 'custom') return { from: p.from || undefined, to: p.to || undefined };
  if (p.mode === 'day') return { from: p.anchor, to: p.anchor };
  const ancla = fromIso(p.anchor);
  if (p.mode === 'week') {
    const { desde, hasta } = semanaDe(ancla);
    return { from: isoLocal(desde), to: isoLocal(hasta) };
  }
  const desde = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const hasta = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0);
  return { from: isoLocal(desde), to: isoLocal(hasta) };
}


/** Texto del período elegido, para que quede claro qué se está mirando. */
export function periodLabel(p: Period): string {
  const corto = (s: string) => fromIso(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (p.mode === 'custom') {
    if (p.from && p.to) return `${corto(p.from)} – ${corto(p.to)}`;
    if (p.from) return `desde ${corto(p.from)}`;
    if (p.to) return `hasta ${corto(p.to)}`;
    return 'Todo';
  }
  if (p.mode === 'day') return fromIso(p.anchor).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long' });
  const { from, to } = periodParams(p);
  if (p.mode === 'week') return `${corto(from!)} – ${corto(to!)}`;
  return fromIso(p.anchor).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}
