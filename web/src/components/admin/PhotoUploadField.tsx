import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { ImageCropDialog } from './ImageCropDialog';

interface Props {
  value?: string | null;
  onChange: (url: string | null) => void;
  className?: string;
  label?: string;
  uploadUrl?: string;
  shape?: 'square' | 'circle';
  /** Tamaño máx. del lado más largo tras comprimir. Usar un valor alto (ej. 7000)
   *  para imágenes que deben conservar su resolución original, como la de Modo Cartelera. */
  maxWidthOrHeight?: number;
  /** Peso máx. del archivo comprimido, en MB. */
  maxSizeMB?: number;
  /** Texto de ayuda bajo el recuadro de subida (reemplaza el default de 800×800px). */
  helpText?: string;
  /** Imagen mostrada cuando no hay foto subida (ej. perfil.jpg para el logo del restaurante). */
  defaultPreview?: string;
  /** Si viene, antes de comprimir/subir se abre un recorte (ancho/alto) a esta proporción, ej. 2 = 2:1. */
  cropAspect?: number;
}

/**
 * Comprime la imagen en el navegador (corrige orientación EXIF) antes de
 * subirla, así el backend nunca recibe archivos anómalamente pesados. Los
 * límites de tamaño son configurables por uso (ver `maxWidthOrHeight`/`maxSizeMB`).
 */
export function PhotoUploadField({
  value,
  onChange,
  className,
  label = 'Foto del producto',
  uploadUrl = '/products/upload-photo',
  shape = 'square',
  maxWidthOrHeight = 800,
  maxSizeMB = 1,
  helpText,
  defaultPreview,
  cropAspect,
}: Props) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadBlob(blob: Blob, filename: string) {
    setError(null);
    setUploading(true);
    try {
      const compressed = await imageCompression(blob as File, {
        maxWidthOrHeight,
        maxSizeMB,
        useWebWorker: true,
        initialQuality: 0.85,
      });

      setPreview(URL.createObjectURL(compressed));

      const form = new FormData();
      form.append('photo', compressed, filename);
      const { data } = await api.post(uploadUrl, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.data.url);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo subir la foto.');
      setPreview(value ?? null);
    } finally {
      setUploading(false);
    }
  }

  function handleFile(file: File) {
    if (cropAspect) {
      setCropSrc(URL.createObjectURL(file));
      return;
    }
    uploadBlob(file, file.name);
  }

  const isCircle = shape === 'circle';

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-sm font-medium text-brand-950/70">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative flex cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-brand-950/15 bg-brand-950/[0.02] hover:border-brand-500/50 transition-colors',
          isCircle ? 'h-24 w-24 rounded-full mx-auto' : 'h-40 w-full rounded-2xl',
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                onChange(null);
              }}
              className={cn(
                'absolute rounded-full bg-black/50 p-1 text-white hover:bg-black/70',
                isCircle ? 'top-0 right-0' : 'top-2 right-2',
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : defaultPreview ? (
          <>
            <img src={defaultPreview} alt="" className="h-full w-full object-cover opacity-90" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
              <ImagePlus className="h-5 w-5 text-white" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-brand-950/40">
            <ImagePlus className={isCircle ? 'h-5 w-5' : 'h-6 w-6'} />
            {!isCircle && (
              <span className="text-xs font-light">{helpText ?? `Subir foto (máx. ${maxWidthOrHeight}×${maxWidthOrHeight}px)`}</span>
            )}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}

      {cropSrc && cropAspect && (
        <ImageCropDialog
          imageSrc={cropSrc}
          aspect={cropAspect}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onCropped={(blob) => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
            uploadBlob(blob, 'banner.jpg');
          }}
        />
      )}
    </div>
  );
}
