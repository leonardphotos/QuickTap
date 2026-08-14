import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface InlinePanelProps {
  title: string;
  description?: string;
  /** Sin esto, el panel no muestra botón de cerrar (raro — casi siempre se pasa). */
  onClose?: () => void;
  /** "Cerrar" para formularios, "← Volver" para vistas de detalle. */
  closeLabel?: string;
  /** 'wide' quita el tope de ancho pensado para formularios de 1-2 columnas. */
  size?: 'default' | 'wide';
  /** Slot a la derecha del título, antes del botón de cerrar (ej. un botón secundario). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Reemplazo de <Dialog><DialogContent> para Administración: en vez de flotar centrado sobre
 * un overlay (ver components/ui/dialog.tsx, que sigue existiendo tal cual para el resto de la
 * app), esto se renderiza en el flujo normal del documento — una tarjeta más en la página.
 *
 * A propósito NO tiene animación de entrada/salida, trampa de foco, cierre con Escape ni cierre
 * al hacer click afuera: esas eran conductas de ventana flotante que ya no aplican estando en
 * línea. El único guiño de "algo pasó" es el scroll automático al montarse, porque el botón que
 * lo abre puede estar lejos del panel (ej. "Añadir ingreso" al final de una lista larga).
 */
export function InlinePanel({ title, description, onClose, closeLabel = 'Cerrar', size = 'default', actions, children }: InlinePanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  return (
    <section
      ref={ref}
      className={`rounded-2xl border border-brand-950/[0.08] bg-white shadow-sm p-5 md:p-6 ${size === 'wide' ? '' : 'max-w-lg'}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-brand-950">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-brand-950/50 font-light">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-brand-950/50 hover:text-brand-950 hover:bg-brand-950/5 transition-colors"
            >
              {closeLabel === 'Cerrar' ? (
                <X className="h-4 w-4" />
              ) : (
                closeLabel
              )}
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
