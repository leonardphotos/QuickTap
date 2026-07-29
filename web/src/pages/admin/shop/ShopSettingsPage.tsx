import { useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import type { Currency } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { ShopTeamSection } from './ShopTeamSection';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';

interface Props {
  onBack: () => void;
}

/** Moneda base: no vive en un componente propio en el panel de restaurante (es un card suelto
 * dentro de SettingsPage.tsx) — se replica acá igual de simple, sin un componente compartido. */
function CurrencySection() {
  const { restaurant, refresh } = useAuth();
  const [baseCurrency, setBaseCurrency] = useState<Currency>(restaurant?.baseCurrency ?? 'USD');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { baseCurrency });
      await refresh();
      setMessage('Moneda guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Moneda</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          ¿En qué moneda colocas tus precios? La conversión a Bs se calcula sola con la tasa BCV.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <select
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value as Currency)}
          className="w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
        >
          <option value="USD">Dólares ($)</option>
          <option value="EUR">Euros (€)</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}
        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}

/**
 * Ajustes de QuickTap Shop: mismas secciones generales que el panel de restaurante (datos del
 * negocio, moneda, métodos de pago, horario) reutilizando los mismos componentes — son
 * genéricos, no asumen nada de mesas/cocina/delivery — menos las opciones que sí son solo de
 * restaurante (mensaje de WhatsApp de comanda, PIN de comandas, impresión de tickets de cocina,
 * zonas de delivery, Modo Cartelera). "Cerrar sesión" vive acá en vez de en la barra superior.
 */
export default function ShopSettingsPage({ onBack }: Props) {
  const { user, logout } = useAuth();
  const canManageTeam = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-950/60 hover:text-brand-950 self-start"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al panel
      </button>
      <h1 className="text-xl font-bold text-brand-950">Ajustes</h1>

      <RestaurantInfoSection />
      <CurrencySection />
      <PaymentMethodsSection descriptionOverride="Elige qué métodos aceptas al cobrar en Venta, y sus datos para que tus clientes sepan a dónde pagar." />
      <ScheduleSection />
      {canManageTeam && <ShopTeamSection />}
      <LockScreenSettingsSection />

      <TextureCard>
        <TextureCardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm font-semibold text-brand-950">Cerrar sesión</p>
            <p className="text-xs text-brand-950/50 font-light">Sales de esta cuenta en este dispositivo.</p>
          </div>
          <TextureButton variant="minimal" size="default" className="!w-auto shrink-0" onClick={logout}>
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </TextureButton>
        </TextureCardContent>
      </TextureCard>
    </div>
  );
}
