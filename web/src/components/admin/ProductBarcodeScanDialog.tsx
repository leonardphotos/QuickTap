import { useEffect, useRef, useState } from 'react';
import ScannerModal from '@/components/ui/scanner-modal';
import { TextureButton } from '@/components/ui/texture-button';
import type { Product } from '@/types';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { playScannerSound } from '@/pages/admin/shop/shopSounds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** El producto encontrado se entrega tal cual — quien llama decide qué hacer (normalmente
   * abrir el mismo picker de variantes/modificadores que se usa al tocar la tarjeta a mano). */
  onFound: (product: Product) => void;
}

/**
 * Escáner de códigos de barra con la cámara del celular, para el catálogo de un restaurante
 * (Product.sku) — misma cámara y lector que ya usa Local Comercial (useBarcodeCamera,
 * @zxing/browser), pero sin duplicar la lógica de armar el carrito: al encontrar el producto
 * simplemente se entrega a quien llama, que reabre el picker normal de variantes/modificadores.
 * Útil para negocios híbridos (ej. una licorería o mini-market con productos empaquetados) o
 * simplemente para agregar rápido sin buscar por nombre en la grilla.
 */
export default function ProductBarcodeScanDialog({ open, onOpenChange, products, onFound }: Props) {
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const lastBeepCodeRef = useRef<string | null>(null);
  const lockedRef = useRef(false);

  const { videoRef, cameraError } = useBarcodeCamera(open, (code) => {
    if (lockedRef.current) return;
    if (lastBeepCodeRef.current !== code) {
      lastBeepCodeRef.current = code;
      playScannerSound();
    }
    const found = products.find((p) => p.sku && p.sku.toLowerCase() === code.toLowerCase());
    if (found) {
      lockedRef.current = true;
      setNotFoundCode(null);
      onFound(found);
      onOpenChange(false);
      return;
    }
    setNotFoundCode(code);
  });

  useEffect(() => {
    if (!open) return;
    setNotFoundCode(null);
    lastBeepCodeRef.current = null;
    lockedRef.current = false;
  }, [open]);

  return (
    <ScannerModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Escanear producto"
      footer={
        <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => onOpenChange(false)}>
          Cerrar
        </TextureButton>
      }
    >
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
        {!cameraError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 aspect-[3/1] border-2 border-white/70 rounded-lg" />
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/80">
            <p className="text-sm text-white text-center">{cameraError} Revisa los permisos de cámara del navegador.</p>
          </div>
        )}
      </div>

      {notFoundCode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-2">
          <p className="text-[13px] text-amber-700">
            Sin coincidencias para el código <span className="font-semibold">{notFoundCode}</span>. Revisa que el
            producto tenga ese SKU cargado.
          </p>
          <TextureButton variant="minimal" size="sm" className="!w-auto shrink-0" onClick={() => setNotFoundCode(null)}>
            Reintentar
          </TextureButton>
        </div>
      )}
    </ScannerModal>
  );
}
