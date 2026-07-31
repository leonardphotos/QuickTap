import { useCallback, useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import ScannerModal from '@/components/ui/scanner-modal';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { playScannerSound } from './shopSounds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama una sola vez por código detectado, tras confirmar — el diálogo se cierra solo. */
  onScan: (code: string) => void;
  /** Si se pasa, muestra un link "Escribir código a mano" — para lectores USB/Bluetooth o cuando
   * no hay cámara disponible. Cierra este diálogo y le pasa el control a quien lo abrió. */
  onManualEntry?: () => void;
}

/**
 * Versión simple del escáner de cámara para Inventario: a diferencia de ShopBarcodeScanDialog
 * (Venta), acá no busca contra el catálogo — solo lee un código y lo devuelve para que quien
 * abrió el diálogo decida qué hacer (cargarlo como SKU nuevo, buscarlo entre los productos, etc.).
 * Usa ScannerModal (sin backdrop-filter) en vez del <Dialog> compartido — ver ese archivo.
 */
export default function ShopSkuScanDialog({ open, onOpenChange, onScan, onManualEntry }: Props) {
  const [detected, setDetected] = useState<string | null>(null);

  const handleDecode = useCallback((code: string) => {
    setDetected((prev) => {
      if (prev) return prev;
      playScannerSound();
      return code;
    });
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
    <ScannerModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Escanear código de barras"
      footer={
        <>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => onOpenChange(false)}>
            Cerrar
          </TextureButton>
          <TextureButton variant="brand" size="default" className="!w-auto" disabled={!detected} onClick={confirmUse}>
            Usar este código
          </TextureButton>
        </>
      }
    >
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
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

      {onManualEntry && (
        <button
          type="button"
          onClick={onManualEntry}
          className="text-[12px] font-semibold text-brand-500 hover:text-brand-600 text-center"
        >
          Escribir código a mano / usar lector USB
        </button>
      )}
    </ScannerModal>
  );
}
