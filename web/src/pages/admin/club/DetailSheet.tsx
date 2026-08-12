import type { ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Ventana de detalle del panel del club.
 *
 * Existe una sola y la usan todas las pantallas (clase, grupo, programa, alumno,
 * profesor, cobro, reserva) porque en un sistema administrativo cada fila tiene
 * que poder abrirse, y si cada pestaña armara su propio diálogo terminarían con
 * siete cabeceras distintas y siete formas de mostrar "pagado".
 *
 * Piezas que expone para que todas las fichas se lean igual:
 *  - `Row`      → dato suelto: etiqueta a la izquierda, valor a la derecha.
 *  - `Section`  → bloque con título.
 *  - `PayBadge` → el estado de pago, con el MISMO color en toda la plataforma.
 *  - `ItemRow`  → fila de lista pulsable (para anidar: de un grupo a un alumno).
 */
export default function DetailSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* DialogContent ya trae su propia X (absolute right-4 top-4) — no se repite acá.
          Se le deja el espacio a la derecha (pr-9) para que el título largo no quede
          debajo del botón. */}
      <DialogContent className="flex max-h-[88vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-brand-950/[0.06] py-5 pl-5 pr-9">
          <h2 className="truncate text-[17px] font-bold tracking-tight text-brand-950">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] font-light text-brand-950/50">{subtitle}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && <div className="border-t border-brand-950/[0.06] p-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-brand-950">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'muted' | 'strong' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[13px] font-light text-brand-950/50">{label}</span>
      <span
        className={`min-w-0 text-right text-[13px] ${
          tone === 'strong' ? 'font-bold text-brand-950' : tone === 'muted' ? 'font-light text-brand-950/40' : 'font-medium text-brand-950'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Estado de pago con color consistente. Un mismo estado se ve igual en la clase,
 *  en el grupo, en el alumno y en cobros — si cada pantalla eligiera su color,
 *  "pendiente" sería ámbar en una y rojo en otra. */
export type PayState = 'PAID' | 'PENDING' | 'OVERDUE' | 'NO_CREDITS';

const PAY_COLORS: Record<PayState, string> = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  OVERDUE: 'border-red-200 bg-red-50 text-red-700',
  NO_CREDITS: 'border-red-200 bg-red-50 text-red-700',
};

export function PayBadge({ state, label }: { state: PayState; label: string }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PAY_COLORS[state]}`}>
      {label}
    </span>
  );
}

/** Fila de lista dentro de una ficha. Con `onClick` se vuelve pulsable, para
 *  poder ir de un grupo a un alumno sin cerrar y volver a buscar. */
export function ItemRow({
  title,
  subtitle,
  right,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-brand-950">{title}</span>
        {subtitle && <span className="block truncate text-[12px] font-light text-brand-950/50">{subtitle}</span>}
      </span>
      {right}
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-2 py-2.5">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-brand-950/[0.03]"
    >
      {content}
    </button>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-[13px] font-light text-brand-950/40">{children}</p>;
}
