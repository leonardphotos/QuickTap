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
  size = 'detail',
}: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `detail` es una ficha: se lee, y en horizontal aprovecha el ancho para que el
   * listado de inscritos no venga en columna de cerillas.
   * `form` es un formulario corto (cobrar, ajustar): estirarlo solo aleja la
   * etiqueta de su campo.
   */
  size?: 'detail' | 'form';
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* DialogContent ya trae su propia X (absolute right-4 top-4) — no se repite acá.
          Se le deja el espacio a la derecha (pr-12) para que el título largo no quede
          debajo del botón. */}
      <DialogContent
        className={`flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 ${
          size === 'form' ? 'max-w-md' : 'max-w-md sm:max-w-xl lg:max-w-3xl'
        }`}
      >
        <div className="border-b border-brand-950/[0.06] py-4 pl-5 pr-11 lg:py-5">
          <h2 className="truncate text-[16px] font-bold tracking-tight text-brand-950">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[12px] font-light text-brand-950/50">{subtitle}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-6">{children}</div>

        {footer && <div className="border-t border-brand-950/[0.06] p-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cuerpo de la ficha a dos columnas cuando hay ancho. Las `Section` de adentro se
 * reparten solas: los datos quedan al lado de las listas en vez de debajo, que es
 * lo que obligaba a bajar tres pantallas para ver quién está inscrito.
 * En vertical vuelve a una sola columna sin tocar nada.
 */
export function SheetBody({ children }: { children: ReactNode }) {
  // grid-cols-1 no es decorativo: es lo que le da al track su minmax(0,1fr).
  // Sin eso, el track por defecto usa min-width:auto (como un flex item) y una
  // fila con texto largo revienta el ancho del diálogo entero en vez de truncar.
  return <div className="grid grid-cols-1 gap-x-9 lg:grid-cols-2 lg:items-start">{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-brand-950/[0.06] pb-1.5">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-brand-950/40">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'muted' | 'strong' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[12px] font-light text-brand-950/50">{label}</span>
      <span
        className={`min-w-0 text-right text-[12px] ${
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
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${PAY_COLORS[state]}`}>
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
        <span className="block truncate text-[13px] font-semibold text-brand-950">{title}</span>
        {subtitle && <span className="block truncate text-[11.5px] font-light text-brand-950/50">{subtitle}</span>}
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
