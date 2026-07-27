import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Modal mínimo SIN backdrop-filter, usado solo por los diálogos que muestran la cámara
 * (ShopBarcodeScanDialog, ShopSkuScanDialog). El <Dialog> compartido (radix-ui, ver dialog.tsx)
 * aplica `backdrop-blur` en su overlay — esa combinación con un <video> de getUserMedia es un bug
 * conocido de WebKit: el video queda genuinamente reproduciendo (currentTime avanza, readyState
 * > 2, sin ningún error) pero se pinta en negro en pantalla. Evitar backdrop-filter cerca del
 * video mientras está activo es el arreglo — por eso este modal no usa blur, solo un overlay
 * semitransparente plano.
 */
export default function ScannerModal({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-[24px] border border-brand-950/[0.06] bg-white p-6 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)] max-h-[85vh] overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-brand-950/40 hover:text-brand-950 hover:bg-brand-950/5 transition-colors"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>
        {children}
        <div className="flex items-center justify-end gap-2 pt-2">{footer}</div>
      </div>
    </div>
  );
}
