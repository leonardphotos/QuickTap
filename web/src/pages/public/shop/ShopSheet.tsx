import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Hoja inferior de la tienda virtual — mismas medidas y curvatura que las del menú de
 * restaurantes (ver components/ui/family-drawer.tsx) para que las dos vitrinas se sientan
 * del mismo producto.
 *
 * Va en un portal al <body> y no dentro de la página: si viviera en el árbol del catálogo,
 * el `overflow-hidden` del contenedor del banner le recortaría las esquinas.
 */
export function ShopSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  // Se congela el scroll del catálogo mientras la hoja está abierta, si no el fondo se mueve
  // debajo al arrastrar en el móvil y se pierde el lugar donde estaba mirando.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="shop-sheet-scrim absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="shop-sheet-panel absolute inset-x-2 bottom-2 mx-auto max-w-[440px] rounded-[34px] border border-white/70 bg-white/94 shadow-[0_28px_90px_-28px_rgba(0,0,0,.48)] backdrop-blur-2xl sm:inset-x-4 sm:bottom-4">
        <div className="max-h-[88dvh] overflow-y-auto px-5 pb-6 pt-3 sm:px-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-950/15" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-brand-950/[0.055] text-brand-950/55 transition-transform active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
