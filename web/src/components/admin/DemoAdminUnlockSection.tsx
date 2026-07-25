import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

/**
 * Entorno Demo Efímero → "Modo administrador": código fijo de 4 dígitos que
 * exime al restaurante demo del reset automático (logout/inactividad), para
 * dejar cambios permanentes sin que se borren. Solo visible/aplicable en el
 * restaurante demo.
 */
export function DemoAdminUnlockSection() {
  const { restaurant, refresh } = useAuth();
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!restaurant?.isDemo) return null;

  async function unlock() {
    setError(null);
    setMessage(null);
    if (!/^\d{4}$/.test(pin)) {
      setError('El código debe tener exactamente 4 dígitos.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/restaurant/demo-admin-unlock', { pin });
      await refresh();
      setPin('');
      setMessage('Cambios permanentes activados.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo activar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Modo administrador (demo)</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Este restaurante es un entorno demo: normalmente cualquier cambio se revierte solo al cerrar sesión o por
          inactividad. Ingresa el código de administrador para que los próximos cambios queden permanentes.{' '}
          {restaurant.demoAdminUnlocked ? (
            <span className="text-emerald-600 font-medium">Activado: los cambios ya no se revierten.</span>
          ) : (
            <span className="text-amber-600 font-medium">Sin activar: los cambios se revierten solos.</span>
          )}
        </p>
      </TextureCardHeader>
      {!restaurant.demoAdminUnlocked && (
        <TextureCardContent className="space-y-3">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="Código de 4 dígitos"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-brand-500">{message}</p>}

          <div>
            <TextureButton variant="brand" size="default" disabled={saving} onClick={unlock} className="!w-auto disabled:opacity-50">
              {saving ? 'Activando…' : 'Activar cambios permanentes'}
            </TextureButton>
          </div>
        </TextureCardContent>
      )}
    </TextureCard>
  );
}
