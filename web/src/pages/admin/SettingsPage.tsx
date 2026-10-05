import { CheckoutExtrasSection } from '@/components/admin/CheckoutExtrasSection';
import { CheckoutSettingsSection } from '@/components/admin/CheckoutSettingsSection';
import { ClubLinkSection } from '@/components/admin/ClubLinkSection';
import { DeleteOrderPinSection } from '@/components/admin/DeleteOrderPinSection';
import { DeliveryPricingSection } from '@/components/admin/DeliveryPricingSection';
import { DeliveryTeamSection } from '@/components/admin/DeliveryTeamSection';
import { DemoAdminUnlockSection } from '@/components/admin/DemoAdminUnlockSection';
import { DesktopShortcutSection } from '@/components/admin/DesktopShortcutSection';
import { FullscreenImageSection } from '@/components/admin/FullscreenImageSection';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';
import { OfflineRelaySection } from '@/components/admin/OfflineRelaySection';
import { PantallaSection } from '@/components/admin/PantallaSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { PrintStationSection } from '@/components/admin/PrintStationSection';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { SalesHistoryExportSection } from '@/components/admin/SalesHistoryExportSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { FullWidth,SettingsCategory,SettingsWorkspace,type SettingsOption } from '@/components/admin/SettingsWorkspace';
import { TeamSection } from '@/components/admin/TeamSection';
import { ThemeSection } from '@/components/admin/ThemeSection';
import { WhatsappLinkSection } from '@/components/admin/WhatsappLinkSection';
import { WhatsappMessageSection } from '@/components/admin/WhatsappMessageSection';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';
import {
Bike,
Building2,
Database,
MessageCircle,
Palette,
Printer,
ShieldCheck,
Users,
Wallet,
} from 'lucide-react';
import { useEffect,useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext.shared';
import type { Currency } from '../../types';
import { formatBsAbsolute } from '../../utils/format';
import { canManageTeam } from '../../utils/roles';

interface RateInfo {
  currency: Currency;
  rateBs: string | null;
  fetchedAt: string | null;
  source: string | null;
  stale: boolean;
  manual: boolean;
  manualRateBs: string | null;
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
  const [manualRateInput, setManualRateInput] = useState('');
  const [savingManualRate, setSavingManualRate] = useState(false);

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
  const isManager = canManageTeam(user?.role);

  useEffect(() => {
    if (activeRate?.manualRateBs != null) setManualRateInput(activeRate.manualRateBs);
  }, [activeRate?.manualRateBs]);

  async function toggleManualRate(manual: boolean) {
    setSavingManualRate(true);
    setError(null);
    try {
      const parsed = Number(manualRateInput.replace(',', '.'));
      const rateBs = manual && parsed > 0 ? parsed : undefined;
      const { data } = await api.patch('/exchange-rates/manual', { manual, rateBs });
      setRates(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la tasa manual.');
    } finally {
      setSavingManualRate(false);
    }
  }

  async function saveManualRateValue() {
    setSavingManualRate(true);
    setError(null);
    try {
      const rateBs = Number(manualRateInput.replace(',', '.'));
      const { data } = await api.patch('/exchange-rates/manual', { manual: true, rateBs });
      setRates(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la tasa manual.');
    } finally {
      setSavingManualRate(false);
    }
  }

  const CATEGORIES: SettingsOption[] = [
    { id: 'negocio', title: 'Información y horarios', description: 'Los datos de tu restaurante y cuándo atiendes a tus clientes.', group: 'negocio', icon: <Building2 className="h-4 w-4" /> },
    { id: 'apariencia', title: 'Menú y pantallas', description: 'Personaliza la imagen del menú digital y la pantalla del local.', group: 'negocio', icon: <Palette className="h-4 w-4" /> },
    { id: 'whatsapp', title: 'WhatsApp', description: 'Configura los mensajes y la conexión de tu negocio.', group: 'negocio', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'pagos', title: 'Cobros y moneda', description: 'Métodos de pago, tasa de cambio y preferencias al cobrar.', group: 'operacion', icon: <Wallet className="h-4 w-4" /> },
    { id: 'delivery', title: 'Delivery y repartidores', description: 'Organiza tus entregas, las tarifas de envío y el equipo de reparto.', group: 'operacion', icon: <Bike className="h-4 w-4" /> },
    { id: 'impresion', title: 'Impresión y dispositivos', description: 'Conecta las impresoras y configura los equipos del restaurante.', group: 'operacion', icon: <Printer className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'equipo', title: 'Equipo', description: 'Gestiona los usuarios y sus responsabilidades en el restaurante.', group: 'administracion' as const, icon: <Users className="h-4 w-4" /> }] : []),
    { id: 'seguridad', title: 'Seguridad', description: 'Protege el acceso al panel y las acciones sensibles.', group: 'administracion', icon: <ShieldCheck className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'datos', title: 'Datos y exportaciones', description: 'Consulta las opciones para exportar la información de tu negocio.', group: 'administracion' as const, icon: <Database className="h-4 w-4" /> }] : []),
  ];

  const [openCategory, setOpenCategory] = useState<string>(() => {
    const section = new URLSearchParams(window.location.search).get('section');
    return CATEGORIES.some(category => category.id === section) ? section! : 'negocio';
  });

  function selectCategory(id: string) {
    setOpenCategory(id);
  }

  function toggleCategory(id: string) {
    setOpenCategory(id);
  }

  return (
    <SettingsWorkspace options={CATEGORIES} active={openCategory} onSelect={selectCategory}>

      <SettingsCategory id="negocio" title="Negocio" icon={<Building2 className="h-4 w-4" />} open={openCategory === 'negocio'} onToggle={toggleCategory}>
        <RestaurantInfoSection />
        <ScheduleSection />
        {isManager && <FullWidth><ClubLinkSection /></FullWidth>}
      </SettingsCategory>

      <SettingsCategory id="whatsapp" title="WhatsApp" icon={<MessageCircle className="h-4 w-4" />} open={openCategory === 'whatsapp'} onToggle={toggleCategory}>
        <WhatsappLinkSection titulo="WhatsApp del negocio" />
        <WhatsappMessageSection />
      </SettingsCategory>

      <SettingsCategory id="pagos" title="Pagos y moneda" icon={<Wallet className="h-4 w-4" />} open={openCategory === 'pagos'} onToggle={toggleCategory}>
        <TextureCard>
          <TextureCardHeader className="px-6">
            <TextureCardTitle className="pl-0">Tasa cambiaria</TextureCardTitle>
            <p className="text-brand-950/60 font-light text-base">
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

            <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-950/10 bg-brand-50/40 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-brand-950 text-base">Fijar tasa manualmente</p>
                <p className="mt-0.5 font-light text-brand-950/50 text-xs">
                  En vez de usar la tasa BCV automática, coloca tú mismo el valor en Bs y no cambiará hasta que lo
                  edites.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!activeRate?.manual}
                aria-label="Fijar tasa manualmente"
                disabled={savingManualRate}
                onClick={() => toggleManualRate(!activeRate?.manual)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  activeRate?.manual ? 'bg-brand-500' : 'bg-brand-950/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    activeRate?.manual ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={manualRateInput}
                onChange={(e) => setManualRateInput(e.target.value)}
                placeholder="Ej: 55.30"
                className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
              />
              <span className="text-sm text-brand-950/50">Bs / {baseCurrency === 'USD' ? '$1' : '€1'}</span>
              <TextureButton
                variant="brand"
                size="sm"
                disabled={savingManualRate}
                onClick={saveManualRateValue}
                className="!w-auto disabled:opacity-50"
              >
                {savingManualRate ? 'Guardando…' : 'Guardar y activar'}
              </TextureButton>
            </div>

            {activeRate && (
              <div className="text-sm bg-brand-950/[0.03] rounded-lg p-3 space-y-1">
                {activeRate.manual ? (
                  activeRate.manualRateBs ? (
                    <p>
                      Tasa manual activa: <span className="font-semibold">{formatBsAbsolute(activeRate.manualRateBs)}</span>{' '}
                      / {baseCurrency === 'USD' ? '$1' : '€1'}
                    </p>
                  ) : (
                    <p className="text-amber-600 text-base">Activaste la tasa manual pero aún no has guardado un valor.</p>
                  )
                ) : activeRate.rateBs ? (
                  <>
                    <p>
                      Tasa BCV vigente: <span className="font-semibold">{formatBsAbsolute(activeRate.rateBs)}</span> /{' '}
                      {baseCurrency === 'USD' ? '$1' : '€1'}
                    </p>
                    <p className="text-brand-950/50 font-light text-xs">
                      Actualizada: {new Date(activeRate.fetchedAt!).toLocaleString('es-VE')} · Fuente: {activeRate.source}
                    </p>
                    {activeRate.stale && (
                      <p className="text-amber-600 text-xs">
                        ⚠️ Esta tasa tiene más de{' '}
                        {Math.round((Date.now() - new Date(activeRate.fetchedAt!).getTime()) / 3600000)}h de antigüedad.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-amber-600 text-base">Aún no se ha obtenido una tasa BCV para esta moneda.</p>
                )}
                {!activeRate.manual && (
                  <button
                    onClick={refreshRates}
                    disabled={refreshing}
                    className="text-xs font-medium text-brand-500 underline disabled:opacity-50"
                  >
                    {refreshing ? 'Actualizando…' : 'Actualizar tasa ahora'}
                  </button>
                )}
              </div>
            )}

            {error && <p className="text-red-600 text-base">{error}</p>}
            {message && <p className="text-brand-500 text-base">{message}</p>}

            <TextureButton variant="brand" size="default" disabled={saving} onClick={saveCurrency} className="!w-auto disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </TextureButton>
          </TextureCardContent>
        </TextureCard>
        <PaymentMethodsSection />
        <CheckoutSettingsSection />
        <CheckoutExtrasSection />
      </SettingsCategory>

      <SettingsCategory id="delivery" title="Delivery" icon={<Bike className="h-4 w-4" />} open={openCategory === 'delivery'} onToggle={toggleCategory}>
        <DeliveryTeamSection />
        <FullWidth>
          <DeliveryPricingSection />
        </FullWidth>
      </SettingsCategory>

      <SettingsCategory
        id="apariencia"
        title="Apariencia del menú público"
        icon={<Palette className="h-4 w-4" />}
        open={openCategory === 'apariencia'}
        onToggle={toggleCategory}
      >
        <FullscreenImageSection />
        <FullWidth>
          <ThemeSection />
        </FullWidth>
        <FullWidth>
          <PantallaSection />
        </FullWidth>
      </SettingsCategory>

      {isManager && (
        <SettingsCategory
          id="equipo"
          title="Equipo y seguridad"
          icon={<ShieldCheck className="h-4 w-4" />}
          open={openCategory === 'equipo'}
          onToggle={toggleCategory}
        >
          <TeamSection />
        </SettingsCategory>
      )}

      <SettingsCategory
        id="impresion"
        title="Estación de impresión"
        icon={<Printer className="h-4 w-4" />}
        open={openCategory === 'impresion'}
        onToggle={toggleCategory}
      >
        <PrintStationSection />
        <OfflineRelaySection />
        <DesktopShortcutSection />
      </SettingsCategory>

      {isManager && (
        <SettingsCategory
          id="datos"
          title="Datos y reportes"
          icon={<Database className="h-4 w-4" />}
          open={openCategory === 'datos'}
          onToggle={toggleCategory}
        >
          <SalesHistoryExportSection />
          <DemoAdminUnlockSection />
        </SettingsCategory>
      )}

        <SettingsCategory
          id="seguridad"
          title="Seguridad"
          icon={<ShieldCheck className="h-4 w-4" />}
          open={openCategory === 'seguridad'}
          onToggle={toggleCategory}
        >
          {isManager && <DeleteOrderPinSection />}
          <LockScreenSettingsSection />
        </SettingsCategory>
    </SettingsWorkspace>
  );
}
