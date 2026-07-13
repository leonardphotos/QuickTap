import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { RestaurantSocialLinks, RestaurantTheme } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { ColorPickerField } from './ColorPickerField';

export const THEME_DEFAULTS: Required<Pick<RestaurantTheme, 'background' | 'primary' | 'buttonText' | 'accent' | 'text' | 'bannerColor'>> = {
  background: '#F7F8F9',
  primary: '#056CF2',
  buttonText: '#FFFFFF',
  accent: '#0597F2',
  text: '#001B43',
  bannerColor: '#001B43',
};

const SOCIAL_FIELDS: { key: keyof RestaurantSocialLinks; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/tu-restaurante' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/tu-restaurante' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@tu-restaurante' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/tu-restaurante' },
];

export function ThemeSection() {
  const { restaurant, refresh } = useAuth();
  const [theme, setTheme] = useState<RestaurantTheme>(restaurant?.theme ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof Omit<RestaurantTheme, 'socialLinks'>, value: string) {
    setTheme((t) => ({ ...t, [key]: value }));
  }

  function setSocial(key: keyof RestaurantSocialLinks, value: string) {
    setTheme((t) => ({ ...t, socialLinks: { ...t.socialLinks, [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { theme });
      await refresh();
      setMessage('Apariencia guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Apariencia del menú público</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Personaliza los colores que ven tus clientes al abrir tu menú. Los cambios no afectan este panel.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <ColorPickerField
            label="Fondo"
            value={theme.background ?? ''}
            defaultValue={THEME_DEFAULTS.background}
            onChange={(v) => set('background', v)}
          />
          <ColorPickerField
            label="Botones (color principal)"
            value={theme.primary ?? ''}
            defaultValue={THEME_DEFAULTS.primary}
            onChange={(v) => set('primary', v)}
          />
          <ColorPickerField
            label="Texto de los botones"
            value={theme.buttonText ?? ''}
            defaultValue={THEME_DEFAULTS.buttonText}
            onChange={(v) => set('buttonText', v)}
          />
          <ColorPickerField
            label="Acentos / detalles"
            value={theme.accent ?? ''}
            defaultValue={THEME_DEFAULTS.accent}
            onChange={(v) => set('accent', v)}
          />
          <ColorPickerField
            label="Texto principal"
            value={theme.text ?? ''}
            defaultValue={THEME_DEFAULTS.text}
            onChange={(v) => set('text', v)}
          />
          <ColorPickerField
            label="Color del banner"
            value={theme.bannerColor ?? ''}
            defaultValue={THEME_DEFAULTS.bannerColor}
            onChange={(v) => set('bannerColor', v)}
          />
        </div>

        <div className="pt-2 border-t border-brand-950/[0.06] space-y-3">
          <div>
            <p className="text-sm font-medium text-brand-950">Redes sociales</p>
            <p className="text-xs text-brand-950/50 font-light">
              Aparecen como iconos en el banner de tu menú público.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {SOCIAL_FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="text-brand-950/70">{f.label}</span>
                <input
                  value={theme.socialLinks?.[f.key] ?? ''}
                  onChange={(e) => setSocial(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto px-4 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
