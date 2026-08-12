import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { card } from './clubStyle';

/**
 * Lectura horizontal del panel del club.
 *
 * En vertical (teléfono) cada registro es un bloque apilado; en horizontal se
 * convierte en una TABLA con encabezados de columna. Es la misma diferencia que
 * hay entre una libreta y una planilla: apilado obliga a meter cinco datos en un
 * renglón separados por puntos ("Lun 18:00 · Pedro · Cancha 2 · Agendada"), y eso
 * se lee peor cuanto más ancha es la pantalla, porque el ojo pierde el eje.
 *
 * Con columnas el ojo baja en línea recta: todas las canchas están en la misma
 * vertical, todos los montos también. Por eso el mismo dato no se dice dos veces
 * ni se abrevia — la columna ya dice qué es.
 *
 * Cómo se arma:
 *
 *   <ClubTable columns={COLS} rows={items.length} empty="No hay nada.">
 *     {items.map((x) => (
 *       <ClubRow key={x.id} onClick={...} cells={[<>…</>, <>…</>]} />
 *     ))}
 *   </ClubTable>
 *
 * El ancho de cada columna viaja como variable CSS (`--club-cols`) y solo se
 * aplica de `lg` para arriba: debajo de eso la grilla no existe y cada celda se
 * dibuja como "ETIQUETA … valor", que es lo que se lee bien en un teléfono.
 */
export interface ClubColumn {
  key: string;
  /** Encabezado. Vacío para la columna de acciones, que no necesita título. */
  label: string;
  /** Ancho dentro de la grilla horizontal: '96px', 'minmax(0,1.5fr)'… */
  width: string;
  align?: 'right';
}

const ColumnsCtx = createContext<ClubColumn[]>([]);

export function ClubTable({
  columns,
  rows,
  empty = 'Nada por aquí todavía.',
  children,
}: {
  columns: ClubColumn[];
  /** Cuántas filas se están pintando. Explícito porque con `children` no se puede
   *  saber de forma confiable, y de eso depende ocultar los encabezados. */
  rows: number;
  empty?: string;
  children: ReactNode;
}) {
  if (rows === 0) {
    return <p className="py-12 text-center text-sm font-light text-brand-950/40">{empty}</p>;
  }

  return (
    <ColumnsCtx.Provider value={columns}>
      <div className="-mx-2 mt-5" style={{ '--club-cols': columns.map((c) => c.width).join(' ') } as CSSProperties}>
        <div className="hidden gap-x-5 border-b border-brand-950/[0.07] px-3 pb-3 lg:grid lg:[grid-template-columns:var(--club-cols)]">
          {columns.map((c) => (
            <span
              key={c.key}
              className={cn(
                'truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-brand-950/35',
                c.align === 'right' && 'text-right',
              )}
            >
              {c.label}
            </span>
          ))}
        </div>
        <div className="divide-y divide-brand-950/[0.05]">{children}</div>
      </div>
    </ColumnsCtx.Provider>
  );
}

/**
 * Una fila. Cuando es pulsable, el botón que la abre es una capa transparente del
 * tamaño de toda la fila y el contenido se vuelve `pointer-events-none`, salvo
 * botones y enlaces: así una fila entera se abre con un toque en cualquier punto
 * y sigue habiendo botones reales dentro (Cobrar, Pasar lista) sin anidar un
 * <button> dentro de otro, que el navegador no permite.
 */
export function ClubRow({
  cells,
  onClick,
  label,
  muted,
}: {
  cells: ReactNode[];
  onClick?: () => void;
  /** Qué se abre; lo lee el lector de pantalla, que no ve la fila. */
  label?: string;
  /** Registro dado de baja o inactivo: se atenúa sin esconderlo. */
  muted?: boolean;
}) {
  const columns = useContext(ColumnsCtx);

  return (
    <div className="relative">
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={label ?? 'Ver detalle'}
          className="absolute inset-0 rounded-2xl transition-colors hover:bg-brand-950/[0.035] focus:outline-none focus-visible:bg-brand-950/[0.05] focus-visible:ring-2 focus-visible:ring-brand-400/40"
        />
      )}
      <div
        className={cn(
          'relative grid gap-x-5 gap-y-2 px-3 py-4 lg:items-center lg:gap-y-0 lg:py-[18px] lg:[grid-template-columns:var(--club-cols)]',
          onClick && 'pointer-events-none',
          muted && 'opacity-55',
        )}
      >
        {cells.map((cell, i) => (
          <div
            key={columns[i]?.key ?? i}
            className={cn(
              'flex min-w-0 items-baseline justify-between gap-3 lg:block',
              columns[i]?.align === 'right' && 'lg:text-right',
            )}
          >
            {i > 0 && columns[i]?.label && (
              <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-brand-950/30 lg:hidden">
                {columns[i].label}
              </span>
            )}
            <div className="min-w-0 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">{cell}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dato principal de una celda: el que se lee al bajar la columna. */
export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block truncate text-[14px] font-semibold text-brand-950', className)}>{children}</span>;
}

/** Segundo renglón de una celda: el contexto, no el dato. */
export function SubCell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('mt-0.5 block truncate text-[12.5px] font-light text-brand-950/50', className)}>{children}</span>;
}

/** Dato secundario que vive solo en su columna (teléfono, fecha, conteo). */
export function PlainCell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block truncate text-[13px] font-normal text-brand-950/70', className)}>{children}</span>;
}

export type BadgeTone = 'neutral' | 'brand' | 'emerald' | 'amber' | 'red' | 'sky';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-brand-950/10 bg-brand-950/[0.04] text-brand-950/55',
  brand: 'border-brand-500/20 bg-brand-500/10 text-brand-600',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
};

export function ClubBadge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-[11.5px] font-semibold',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Rótulo de sección, encima de la tarjeta y no dentro. Separar el nombre del
 * bloque de su contenido es lo que le da aire a la pantalla larga: se ve dónde
 * termina una cosa y empieza la otra sin tener que dibujar más bordes.
 */
export function ClubEyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-950/35">{children}</p>
      {action}
    </div>
  );
}

/** Tarjeta blanca con cabecera. Todo bloque de la vertical usa esta, para que el
 *  título, la explicación y los botones estén siempre en el mismo sitio. */
export function ClubPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(card, 'p-5 lg:p-6', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-bold tracking-tight text-brand-950">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-xl text-[12.5px] font-light leading-relaxed text-brand-950/50">{description}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Casilla del resumen. Con `onClick` se abre: en un sistema administrativo un
 * número que no se puede desglosar obliga a salir a buscar de dónde salió.
 */
export function ClubMetric({
  value,
  label,
  hint,
  tone = 'default',
  onClick,
}: {
  value: ReactNode;
  label: string;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'amber';
  onClick?: () => void;
}) {
  const body = (
    <>
      <p
        className={cn(
          'text-[26px] font-bold leading-none tracking-tight',
          tone === 'brand' ? 'text-white' : tone === 'amber' ? 'text-amber-900' : 'text-brand-950',
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          'mt-2.5 text-[13px] font-semibold',
          tone === 'brand' ? 'text-white/85' : tone === 'amber' ? 'text-amber-900/75' : 'text-brand-950/70',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-1 min-h-[16px] text-[11.5px] font-light',
          tone === 'brand' ? 'text-white/60' : tone === 'amber' ? 'text-amber-900/55' : 'text-brand-950/40',
        )}
      >
        {hint}
      </p>
    </>
  );

  const skin = cn(
    'rounded-3xl border p-5 text-left transition-all',
    tone === 'brand'
      ? 'border-transparent bg-brand-500 shadow-sm shadow-brand-500/25'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-brand-950/[0.06] bg-white shadow-sm',
    onClick && 'hover:-translate-y-0.5 hover:shadow-md',
  );

  if (!onClick) return <div className={skin}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={skin}>
      {body}
    </button>
  );
}
