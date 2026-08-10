import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

/**
 * Cámara para leer códigos de barra, compartida entre Venta (ShopBarcodeScanDialog) e Inventario
 * (ShopSkuScanDialog). Crea un lector nuevo en cada apertura del diálogo (en vez de reusar uno
 * solo durante toda la sesión) porque @zxing/browser deja el stream de video en un estado
 * inconsistente al reabrir el mismo lector una segunda vez — eso es lo que causaba el cuadro en
 * negro al volver a abrir el escáner. También limpia `video.srcObject` explícitamente al cerrar
 * y llama `.play()` a mano, por si el navegador no arranca el autoplay solo tras asignar el stream.
 *
 * `facingMode` por defecto es la cámara trasera, que es la que se apunta a un código con un
 * equipo en la mano. La tablet de la cancha pide `'user'`: está atornillada a la pared, así que
 * el jugador acerca su QR a la cámara frontal, la única que le queda de frente.
 */
export function useBarcodeCamera(
  open: boolean,
  onDecode: (code: string) => void,
  facingMode: 'environment' | 'user' = 'environment',
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCameraError(null);
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    const videoEl = videoRef.current;

    reader
      .decodeFromConstraints({ video: { facingMode } }, videoEl ?? undefined, (result) => {
        if (cancelled || !result) return;
        onDecodeRef.current(result.getText().trim());
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        videoEl?.play().catch(() => {});
      })
      .catch((err: unknown) => {
        if (!cancelled) setCameraError(err instanceof Error ? err.message : 'No se pudo acceder a la cámara.');
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  return { videoRef, cameraError };
}
