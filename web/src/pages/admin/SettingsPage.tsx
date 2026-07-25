import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Currency } from '../../types';
import { formatBsAbsolute } from '../../utils/format';
import { canManageTeam } from '../../utils/roles';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { TeamSection } from '@/components/admin/TeamSection';
import { ThemeSection } from '@/components/admin/ThemeSection';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { DesktopShortcutSection } from '@/components/admin/DesktopShortcutSection';
import { WhatsappMessageSection } from '@/components/admin/WhatsappMessageSection';
import { CheckoutSettingsSection } from '@/components/admin/CheckoutSettingsSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { FullscreenImageSection } from '@/components/admin/FullscreenImageSection';
import { DeliveryTeamSection } from '@/components/admin/DeliveryTeamSection';
import { DeliveryPricingSection } from '@/components/admin/DeliveryPricingSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { PrintStationSection } from '@/components/admin/PrintStationSection';
import { DeleteOrderPinSection } from '@/components/admin/DeleteOrderPinSection';
import { DemoAdminUnlockSection } from '@/components/admin/DemoAdminUnlockSection';

interface RateInfo {
  currency: Currency;
  rateBs: string | null;
  fetchedAt: string | null;
  source: string | null;
  stale: boolean;
}

const CURRENCY_LABELS: Record<Currency, string> = { USD: 'Dólares ($)', EUR: 'Euros (€)' };

export default function SettingsPage() {
  const { user, restaurant, refresh } = useAuth();
  const [baseCurrency, setBaseCurrency] = useState<Currency>(restaurant?.baseCurrency ?? 'USD');
  const [rates, setRates] = useState<Record<Currency, RateInfo> | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadRates() {
    api.get('/exchange-rates').then((res) => setRates(res.data.data));
  }

  useEffect(loadRates, []);

  async function saveCurrency() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { baseCurrency });
      await refresh();
      setMessage('Configuración guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshRates() {
    setRefreshing(true);
    try {
      const { data } = await api.post('/exchange-rates/refresh');
      setRates(data.data);
    } finally {
      setRefreshing(false);
    }
  }

  const activeRate = rates?.[baseCurrency];

  return (
    <div className="space-y-8 max-w-2xl lg:max-w-none lg:space-y-0 lg:columns-2 lg:gap-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950 [column-span:all] lg:mb-8">Ajustes</h1>

      <div className="break-inside-avoid lg:mb-8">
        <RestaurantInfoSection />
      </div>
      <div className="break-inside-avoid lg:mb-8">
        <DesktopShortcutSection />
      </div>
      <div className="break-inside-avoid lg:mb-8">
        <WhatsappMessageSection />
      </div>

      <TextureCard className="break-inside-avoid lg:mb-8">
        <TextureCardHeader className="px-6">
          <TextureCardTitle className="pl-0">Tasa cambiaria</TextureCardTitle>
          <p className="text-sm text-brand-950/60 font-light">
            Elige en qué moneda colocas tus precios. La conversión a bolívares que ven tus clientes se calcula
            automáticamente con la tasa oficial del Banco Central de Venezuela (BCV).
          </p>
        </TextureCardHeader>
        <TextureCardContent className="space-y-4">
          <div className="flex gap-2">
            {(['USD', 'EUR'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setBaseCurrency(c)}
                className={`flex-1 rounded-lg py-2 text-sm border transition-colors ${
                  baseCurrency === c ? 'bg-brand-950 text-white border-brand-950' : 'bg-white text-brand-950/70 border-brand-950/15'
                }`}
              >
                {CURRENCY_LABELS[c]}
              </button>
            ))}
          </div>

          {activeRate && (
            <div className="text-sm bg-brand-950/[0.03] rounded-lg p-3 space-y-1">
              {activeRate.rateBs ? (
                <>
                  <p>
                    Tasa BCV vigente: <span className="font-semibold">{formatBsAbsolute(activeRate.rateBs)}</span> /{' '}
                    {baseCurrency === 'USD' ? '$1' : '€1'}
                  </p>
                  <p className="text-xs text-brand-950/50 font-light">
                    Actualizada: {new Date(activeRate.fetchedAt!).toLocaleString('es-VE')} · Fuente: {activeRate.source}
                  </p>
                  {activeRate.stale && (
                    <p className="text-xs text-amber-600">
                      ⚠️ Esta tasa tiene más de {' '}
                      {Math.round((Date.now() - new Date(activeRate.fetchedAt!).getTime()) / 3600000)}h de antigüedad.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-amber-600">Aún no se ha obtenido una tasa BCV para esta moneda.</p>
              )}
              <button
                onClick={refreshRates}
                disabled={refreshing}
                className="text-xs font-medium text-brand-500 underline disabled:opacity-50"
              >
                {refreshing ? 'Actualizando…' : 'Actualizar tasa ahora'}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-brand-500">{message}</p>}

          <TextureButton variant="brand" size="default" disabled={saving} onClick={saveCurrency} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </TextureCardContent>
      </TextureCard>

      <div className="break-inside-avoid lg:mb-8">
        <CheckoutSettingsSection />
      </div>

      <div className="break-inside-avoid lg:mb-8">
        <ScheduleSection />
      </div>

      <div className="break-inside-avoid lg:mb-8">
        <PaymentMethodsSection />
      </div>

      <div className="break-inside-avoid lg:mb-8">
        <DeliveryTeamSection />
      </div>

      <div className="break-inside-avoid lg:mb-8">
        <FullscreenImageSection />
      </div>

      {canManageTeam(user?.role) && (
        <div className="break-inside-avoid lg:mb-8">
          <TeamSection />
        </div>
      )}

      {canManageTeam(user?.role) && (
        <div className="break-inside-avoid lg:mb-8">
          <DeleteOrderPinSection />
        </div>
      )}

      {canManageTeam(user?.role) && (
        <div className="break-inside-avoid lg:mb-8">
          <DemoAdminUnlockSection />
        </div>
      )}

      <div className="break-inside-avoid lg:mb-8">
        <PrintStationSection />
      </div>

      {/* Estas dos van al final y ocupan todo el ancho: si quedaran en medio del
          flujo, cortan el balanceo de columnas en dos regiones separadas y el
          grupo final (con pocas tarjetas de tamaños muy distintos) deja un hueco
          grande en una de las columnas. */}
      <div className="[column-span:all] lg:mb-8">
        <DeliveryPricingSection />
      </div>

      <div className="[column-span:all] lg:mb-8">
        <ThemeSection />
      </div>
    </div>
  );
}
