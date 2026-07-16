import { useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  imageSrc: string;
  /** Ancho/alto del recorte final (ej. 2 = 2:1, un banner horizontal). */
  aspect: number;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

/** Recorta una imagen en el navegador (canvas) antes de comprimirla/subirla. */
function getCroppedBlob(imageSrc: string, area: Area, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo procesar la imagen.'));
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))), mimeType, 0.95);
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = imageSrc;
  });
}

/** Diálogo para recortar la imagen (arrastrar/zoom) a un tamaño/proporción fija antes de subirla. */
export function ImageCropDialog({ imageSrc, aspect, onCancel, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!area) return;
    setProcessing(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, area, 'image/jpeg');
      onCropped(blob);
    } catch {
      setError('No se pudo recortar la imagen.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recorta tu imagen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative h-72 w-full rounded-xl overflow-hidden bg-brand-950/[0.06]">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_croppedArea, croppedAreaPixels) => setArea(croppedAreaPixels)}
            />
          </div>
          <label className="block text-sm">
            <span className="text-brand-950/70">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full mt-1 accent-brand-500"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <TextureButton variant="brand" size="default" disabled={processing} className="!w-auto px-5" onClick={confirm}>
              {processing ? 'Recortando…' : 'Usar esta imagen'}
            </TextureButton>
            <TextureButton variant="minimal" size="default" className="!w-auto px-5" onClick={onCancel}>
              Cancelar
            </TextureButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
