import { useState } from 'react';
import ScannerModal from '@/components/ui/scanner-modal';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { findBySku, type StoreProduct } from './clubStoreApi';

interface Props {
  open: boolean;
  products: StoreProduct[];
  onClose: () => void;
  /** Se llama con el producto encontrado. */
  onFound: (product: StoreProduct) => void;
}

/**
 * Escaneo de código de barras para la tienda del club: resuelve el código contra el catálogo
 * y devuelve el producto. Reutiliza el lector de cámara y el modal sin blur que ya existían
 * para el vertical de Locales (ver scanner-modal.tsx por qué no usa el Dialog compartido).
 */
export function ClubScanDialog({ open, products, onClose, onFound }: Props) {
  const [notFound, setNotFound] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  function resolve(code: string) {
    const product = findBySku(products, code);
    if (product) {
      setNotFound(null);
      onFound(product);
      return;
    }
    // No cerrar al fallar: casi siempre el siguiente intento acierta, y cerrar obligaría a
    // volver a abrir la cámara para cada producto sin código cargado.
    setNotFound(code);
  }

  const { videoRef, cameraError } = useBarcodeCamera(open, resolve);

  return (
    <ScannerModal
      open={open}
      onClose={onClose}
      title="Escanear código"
      footer={
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) resolve(manual);
            }}
            className="flex gap-2"
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="O escribe el código"
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-950">
              Buscar
            </button>
          </form>
          <button onClick={onClose} className="w-full py-1.5 text-sm font-medium text-white/60">
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {cameraError ? (
          <p className="py-8 text-center text-sm text-white/70">{cameraError}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted />
        )}
        {notFound && (
          <p className="text-center text-sm text-amber-300">
            No hay ningún producto con el código <span className="font-semibold">{notFound}</span>. Cárgalo en el
            producto para poder escanearlo.
          </p>
        )}
      </div>
    </ScannerModal>
  );
}
