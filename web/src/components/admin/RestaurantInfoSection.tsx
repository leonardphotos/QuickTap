import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { PhotoUploadField } from './PhotoUploadField';

export function RestaurantInfoSection() {
  const { restaurant, refresh } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(restaurant?.logoUrl ?? null);
  const [name, setName] = useState(restaurant?.name ?? '');
  const [description, setDescription] = useState(restaurant?.description ?? '');
  const [whatsappPhone, setWhatsappPhone] = useState(restaurant?.whatsappPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', {
        name,
        description: description || undefined,
        logoUrl: logoUrl || undefined,
        whatsappPhone: whatsappPhone || undefined,
      });
      await refresh();
      setMessage('Información guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Información del local</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Estos datos aparecen en tu panel y en el menú público que ven tus clientes.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <PhotoUploadField
          value={logoUrl}
          onChange={setLogoUrl}
          label="Foto de perfil del local"
          uploadUrl="/restaurant/upload-logo"
          shape="circle"
        />

        <label className="block text-sm">
          <span className="text-brand-950/70">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>

        <label className="block text-sm">
          <span className="text-brand-950/70">Descripción</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Comida criolla y parrilla a la leña."
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>

        <label className="block text-sm">
          <span className="text-brand-950/70">Número de contacto (WhatsApp)</span>
          <input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            placeholder="584141234567"
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto px-4 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
