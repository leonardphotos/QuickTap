import { useCallback, useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBarcodeCamera } from './useBarcodeCamera';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama una sola vez por código detectado, tras confirmar — el diálogo se cierra solo. */
  onScan: (code: string) => void;
}

/**
 * Versión simple del escáner de cámara para Inventario: a diferencia de ShopBarcodeScanDialog
 * (Venta), acá no busca contra el catálogo — solo lee un código y lo devuelve para que quien
 * abrió el diálogo decida qué hacer (cargarlo como SKU nuevo, buscarlo entre los productos, etc.).
 */
export default function ShopSkuScanDialog({ open, onOpenChange, onScan }: Props) {
  const [detected, setDetected] = useState<string | null>(null);

  const handleDecode = useCallback((code: string) => {
    setDetected((prev) => prev ?? code);
  }, []);
  const { videoRef, cameraError } = useBarcodeCamera(open, handleDecode);

  useEffect(() => {
    if (!open) setDetected(null);
  }, [open]);

  function confirmUse() {
    if (!detected) return;
    onScan(detected);
    onOpenChange(false);
  }

  function resumeScanning() {
    setDetected(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
        </DialogHeader>

        {/* Ver ShopBarcodeScanDialog.tsx: translateZ(0) fuerza una capa de composición GPU propia,
            remedio para el bug de WebKit que deja el <video> en negro dentro de un Dialog con transform. */}
        <div
          className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black"
          style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
            muted
            autoPlay
            playsInline
          />
          {!detected && !cameraError && (
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

        {detected ? (
          <div className="rounded-xl border border-brand-950/10 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-brand-950/50">Código detectado</p>
              <p className="text-[14px] font-semibold text-brand-950 truncate">{detected}</p>
            </div>
            <TextureButton variant="minimal" size="sm" className="!w-auto shrink-0" onClick={resumeScanning}>
              Reintentar
            </TextureButton>
          </div>
        ) : (
          <p className="text-[13px] text-brand-950/40 text-center flex items-center justify-center gap-1.5">
            <ScanLine className="h-3.5 w-3.5" /> Apunta la cámara al código de barras
          </p>
        )}

        <DialogFooter>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => onOpenChange(false)}>
            Cerrar
          </TextureButton>
          <TextureButton variant="brand" size="default" className="!w-auto" disabled={!detected} onClick={confirmUse}>
            Usar este código
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
