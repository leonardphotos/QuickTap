import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-3 bottom-3 mx-auto max-w-[420px] rounded-[36px] bg-white shadow-2xl">
        <div className="max-h-[85dvh] overflow-y-auto px-6 pb-6 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-950/15" />
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
