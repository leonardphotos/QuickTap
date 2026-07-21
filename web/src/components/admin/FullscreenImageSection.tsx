import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { PhotoUploadField } from './PhotoUploadField';

/** Modo Cartelera: muestra una sola imagen a pantalla completa en el menú público, sin banner ni botones. */
export function FullscreenImageSection() {
  const { restaurant, refresh } = useAuth();
  const [enabled, setEnabled] = useState(restaurant?.fullscreenImageEnabled ?? false);
  const [imageUrl, setImageUrl] = useState<string | null>(restaurant?.fullscreenImageUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', {
        fullscreenImageEnabled: enabled,
        ...(imageUrl ? { fullscreenImageUrl: imageUrl } : {}),
      });
      await refresh();
      setMessage('Configuración guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Modo Cartelera (pantalla completa)</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Muestra una sola imagen a pantalla completa en tu enlace público, sin banner, botones ni menú. Útil para un
          cartel, promoción o aviso temporal.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm font-medium text-brand-950">Activar Modo Cartelera</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((e) => !e)}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-brand-500' : 'bg-brand-950/15'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`}
            />
          </button>
        </label>

        <PhotoUploadField
          value={imageUrl}
          onChange={setImageUrl}
          label="Imagen de pantalla completa"
          uploadUrl="/restaurant/upload-fullscreen-image"
          shape="square"
          maxWidthOrHeight={2560}
          maxSizeMB={2}
          helpText="Subir imagen (se ajusta automáticamente para verse nítida y cargar rápido en el celular)"
        />

        {enabled && !imageUrl && (
          <p className="text-xs text-amber-600">Sube una imagen para que el Modo Cartelera funcione.</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
