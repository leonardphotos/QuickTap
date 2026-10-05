import { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  MessageCircle,
  Wallet,
  Bike,
  Palette,
  ShieldCheck,
  Database,
  Printer,
  MonitorPlay,
  Crown,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Currency } from '../../types';
import { formatBsAbsolute } from '../../utils/format';
import { canManageTeam } from '../../utils/roles';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { FullWidth } from '@/components/admin/SettingsCategory';
import { TeamSection } from '@/components/admin/TeamSection';
import { ThemeSection } from '@/components/admin/ThemeSection';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { DesktopShortcutSection } from '@/components/admin/DesktopShortcutSection';
import { ClubLinkSection } from '@/components/admin/ClubLinkSection';
import { WhatsappMessageSection } from '@/components/admin/WhatsappMessageSection';
import { CHATBOTS_ENABLED } from '@/config/features';
import { WhatsappBotSection } from '@/components/admin/WhatsappBotSection';
import { WhatsappLinkSection } from '@/components/admin/WhatsappLinkSection';
import { PlanChangeSection } from '@/components/admin/PlanChangeSection';
import { CheckoutSettingsSection } from '@/components/admin/CheckoutSettingsSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { FullscreenImageSection } from '@/components/admin/FullscreenImageSection';
import { DeliveryTeamSection } from '@/components/admin/DeliveryTeamSection';
import { DeliveryPricingSection } from '@/components/admin/DeliveryPricingSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { PrintStationSection } from '@/components/admin/PrintStationSection';
import { OfflineRelaySection } from '@/components/admin/OfflineRelaySection';
import { DeleteOrderPinSection } from '@/components/admin/DeleteOrderPinSection';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';
import { DemoAdminUnlockSection } from '@/components/admin/DemoAdminUnlockSection';
import { SalesHistoryExportSection } from '@/components/admin/SalesHistoryExportSection';
import { PantallaSection } from '@/components/admin/PantallaSection';

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

  const CATEGORIES = [
    { id: 'negocio', title: 'Negocio', description: 'Datos del local, horario y acceso directo.', icon: <Building2 className="h-4 w-4" /> },
    { id: 'plan', title: 'Mi plan', description: 'Plan actual y cambios de suscripción.', icon: <Crown className="h-4 w-4" /> },
    { id: 'whatsapp', title: 'WhatsApp', description: 'Mensajes automáticos y número vinculado.', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'pagos', title: 'Pagos y moneda', description: 'Tasa cambiaria, métodos de pago y checkout.', icon: <Wallet className="h-4 w-4" /> },
    { id: 'delivery', title: 'Delivery', description: 'Repartidores y zonas de cobro.', icon: <Bike className="h-4 w-4" /> },
    { id: 'apariencia', title: 'Apariencia', description: 'Imagen y colores del menú público.', icon: <Palette className="h-4 w-4" /> },
    { id: 'pantalla', title: 'Pantalla', description: 'Qué se muestra en la pantalla del local.', icon: <MonitorPlay className="h-4 w-4" /> },
    ...(isManager
      ? [{ id: 'equipo', title: 'Equipo y seguridad', description: 'Usuarios, PIN de borrado y bloqueo.', icon: <ShieldCheck className="h-4 w-4" /> }]
      : []),
    { id: 'impresion', title: 'Estación de impresión', description: 'Impresora de comandas y modo offline.', icon: <Printer className="h-4 w-4" /> },
    ...(isManager
      ? [{ id: 'datos', title: 'Datos y reportes', description: 'Exportar historial de ventas.', icon: <Database className="h-4 w-4" /> }]
      : []),
    ...(!isManager ? [{ id: 'seguridad', title: 'Seguridad', description: 'Bloqueo de pantalla.', icon: <Clock className="h-4 w-4" /> }] : []),
  ];

  const [activeCategory, setActiveCategory] = useState<string>('negocio');
  const current = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Ajustes</h1>
        <p className="mt-1 text-sm font-light text-brand-950/50">Configura tu negocio, pagos, equipo y más.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* Navegación por pestañas en celular: scroll horizontal de pastillas. */}
        <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                activeCategory === c.id
                  ? 'border-brand-950 bg-brand-950 text-white'
                  : 'border-brand-950/10 bg-white text-brand-950/65 hover:bg-brand-950/[0.03]'
              }`}
            >
              {c.icon}
              {c.title}
            </button>
          ))}
        </nav>

        {/* Navegación lateral fija en escritorio, estilo panel de ajustes del sistema. */}
        <aside className="hidden shrink-0 lg:block lg:w-64 lg:sticky lg:top-6">
          <nav className="flex flex-col gap-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  activeCategory === c.id ? 'bg-brand-950 text-white' : 'text-brand-950/70 hover:bg-brand-950/[0.04]'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    activeCategory === c.id ? 'bg-white/15 text-white' : 'bg-brand-500/10 text-brand-500'
                  }`}
                >
                  {c.icon}
                </span>
                <span className={activeCategory === c.id ? 'font-medium' : 'font-light'}>{c.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Panel de contenido de la categoría activa. */}
        <div className="min-w-0 flex-1 rounded-3xl border border-brand-950/10 bg-white p-5 sm:p-7">
          <div className="mb-6 border-b border-brand-950/[0.06] pb-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                {current.icon}
              </span>
              <h2 className="text-lg font-semibold text-brand-950">{current.title}</h2>
            </div>
            <p className="mt-1.5 pl-[42px] text-sm font-light text-brand-950/50">{current.description}</p>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {activeCategory === 'negocio' && (
              <>
                <RestaurantInfoSection />
                <DesktopShortcutSection />
                <ScheduleSection />
                {isManager && (
                  <FullWidth>
                    <ClubLinkSection />
                  </FullWidth>
                )}
              </>
            )}

            {activeCategory === 'plan' && (
              <FullWidth>
                <PlanChangeSection onGoToBilling={() => { window.location.href = '/admin/billing'; }} />
              </FullWidth>
            )}

            {activeCategory === 'whatsapp' && (
              <>
                <WhatsappMessageSection />
                {CHATBOTS_ENABLED && <WhatsappBotSection />}
                {/* WhatsApp vinculado por Evolution (independiente de los chatbots viejos): cada
                    negocio con plan Elite conecta SU número. El backend responde 403 en planes
                    menores y la tarjeta se esconde sola si Evolution no está configurada. */}
                <WhatsappLinkSection />
              </>
            )}

            {activeCategory === 'pagos' && (
              <>
                <TextureCard>
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

                    <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-950/10 bg-brand-50/40 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-950">Fijar tasa manualmente</p>
                        <p className="mt-0.5 text-xs font-light text-brand-950/50">
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
                        className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
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
                            <p className="text-amber-600">Activaste la tasa manual pero aún no has guardado un valor.</p>
                          )
                        ) : activeRate.rateBs ? (
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
                                ⚠️ Esta tasa tiene más de{' '}
                                {Math.round((Date.now() - new Date(activeRate.fetchedAt!).getTime()) / 3600000)}h de antigüedad.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-amber-600">Aún no se ha obtenido una tasa BCV para esta moneda.</p>
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

                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {message && <p className="text-sm text-brand-500">{message}</p>}

                    <TextureButton variant="brand" size="default" disabled={saving} onClick={saveCurrency} className="!w-auto disabled:opacity-50">
                      {saving ? 'Guardando…' : 'Guardar cambios'}
                    </TextureButton>
                  </TextureCardContent>
                </TextureCard>
                <PaymentMethodsSection />
                <CheckoutSettingsSection />
              </>
            )}

            {activeCategory === 'delivery' && (
              <>
                <DeliveryTeamSection />
                <FullWidth>
                  <DeliveryPricingSection />
                </FullWidth>
              </>
            )}

            {activeCategory === 'apariencia' && (
              <>
                <FullscreenImageSection />
                <FullWidth>
                  <ThemeSection />
                </FullWidth>
              </>
            )}

            {activeCategory === 'pantalla' && (
              <FullWidth>
                <PantallaSection />
              </FullWidth>
            )}

            {activeCategory === 'equipo' && isManager && (
              <>
                <TeamSection />
                <DeleteOrderPinSection />
                <LockScreenSettingsSection />
              </>
            )}

            {activeCategory === 'impresion' && (
              <>
                <PrintStationSection />
                <OfflineRelaySection />
              </>
            )}

            {activeCategory === 'datos' && isManager && (
              <>
                <SalesHistoryExportSection />
                <DemoAdminUnlockSection />
              </>
            )}

            {activeCategory === 'seguridad' && !isManager && <LockScreenSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
