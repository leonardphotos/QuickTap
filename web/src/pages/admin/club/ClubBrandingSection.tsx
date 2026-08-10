import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { RestaurantTheme } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { ColorPickerField } from '@/components/admin/ColorPickerField';
import { clubGradient } from '@/pages/public/clubPublic';

const DEFAULTS = { primary: '#0B6BCB', accent: '#0597F2', text: '#FFFFFF' };

/**
 * Color de marca del enlace público de reservas y del ticket QR (ver
 * pages/public/ClubPublicPage.tsx y ClubTicketPage.tsx) — no de este panel, que
 * siempre es blanco/azul QuickTap (ver ClubLayout). El logo se edita en
 * RestaurantInfoSection, justo abajo; acá solo van los colores porque son
 * exclusivos de la vertical Club (el resto de secciones son compartidas).
 */
export function ClubBrandingSection() {
  const { restaurant, refresh } = useAuth();
  const [theme, setTheme] = useState<RestaurantTheme>(restaurant?.theme ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { theme });
      await refresh();
      setMessage('Colores guardados.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Marca del enlace de reservas</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Los colores que ven tus jugadores en la página donde reservan y en su código de acceso. No
          afectan a este panel, que siempre se ve igual para todos los clubes.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <ColorPickerField
            label="Color principal"
            value={theme.primary ?? ''}
            defaultValue={DEFAULTS.primary}
            onChange={(v) => setTheme((t) => ({ ...t, primary: v }))}
          />
          <ColorPickerField
            label="Acento"
            value={theme.accent ?? ''}
            defaultValue={DEFAULTS.accent}
            onChange={(v) => setTheme((t) => ({ ...t, accent: v }))}
          />
          <ColorPickerField
            label="Color de fuente"
            value={theme.text ?? ''}
            defaultValue={DEFAULTS.text}
            onChange={(v) => setTheme((t) => ({ ...t, text: v }))}
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-brand-950/70">Así se ve</p>
          <div
            className="flex h-24 items-center justify-center rounded-2xl text-[13px] font-semibold"
            style={{ ...clubGradient(theme), color: theme.text || DEFAULTS.text }}
          >
            {restaurant?.name}
          </div>
        </div>

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" onClick={save} disabled={saving} className="!w-auto">
          {saving ? 'Guardando…' : 'Guardar colores'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
