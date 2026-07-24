import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OutlinedFieldProps {
  label: string;
  /** Texto chico a la derecha, ej. un contador de caracteres ("19/150"). */
  hint?: ReactNode;
  /** Contenido a la izquierda del input, ej. el símbolo de moneda. */
  prefix?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Input con el label "cortado" en el borde superior (look outlined/legend), sin depender de
 * `<fieldset>` nativo para evitar inconsistencias entre navegadores. El input que se le pase
 * como children debe venir sin su propio borde (ver `outlinedFieldInputClass`). */
export function OutlinedField({ label, hint, prefix, className, children }: OutlinedFieldProps) {
  return (
    <div className={cn('relative rounded-lg border border-brand-950/15 px-3 pb-2 pt-2.5', className)}>
      <span className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-brand-950/50 leading-none">{label}</span>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-brand-950/50 shrink-0">{prefix}</span>}
        {children}
        {hint && <span className="text-[11px] text-brand-950/30 shrink-0 whitespace-nowrap">{hint}</span>}
      </div>
    </div>
  );
}

/** Clase para el input/select que va dentro de un `OutlinedField` — sin borde propio, el borde
 * ya lo dibuja el wrapper. */
export const outlinedFieldInputClass = 'w-full min-w-0 text-sm bg-transparent outline-none text-brand-950';
