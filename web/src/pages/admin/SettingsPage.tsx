import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Building2,
  ChevronDown,
  Clock,
  MessageCircle,
  Wallet,
  Bike,
  Palette,
  ShieldCheck,
  Database,
  Printer,
  MonitorPlay,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Currency } from '../../types';
import { formatBsAbsolute } from '../../utils/format';
import { canManageTeam } from '../../utils/roles';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TeamSection } from '@/components/admin/TeamSection';
import { ThemeSection } from '@/components/admin/ThemeSection';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { DesktopShortcutSection } from '@/components/admin/DesktopShortcutSection';
import { ClubLinkSection } from '@/components/admin/ClubLinkSection';
import { WhatsappMessageSection } from '@/components/admin/WhatsappMessageSection';
import { WhatsappBotSection } from '@/components/admin/WhatsappBotSection';
import { CheckoutSettingsSection } from '@/components/admin/CheckoutSettingsSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { FullscreenImageSection } from '@/components/admin/FullscreenImageSection';
import { DeliveryTeamSection } from '@/components/admin/DeliveryTeamSection';
import { DeliveryPricingSection } from '@/components/admin/DeliveryPricingSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { PrintStationSection } from '@/components/admin/PrintStationSection';
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

/**
 * Categoría de Ajustes: título + ícono, con su contenido colapsado/expandido según
 * `open` — la propia cabecera también es clickeable, además del menú desplegable de
 * arriba. La animación de "desplegado fluido" usa el truco de CSS grid-template-rows
 * 0fr → 1fr (en vez de max-height/JS), que anima limpio sin medir el alto del contenido.
 */
function SettingsCategory({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 last:mb-0" id={`ajustes-${id}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-2.5 text-left rounded-2xl px-4 py-3.5 transition-colors ${
          open ? 'bg-brand-500/[0.06]' : 'hover:bg-brand-950/[0.03]'
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          {icon}
        </span>
        <span className="text-base font-semibold text-brand-950 flex-1">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-brand-950/40 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out-strong ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`grid grid-cols-1 lg:grid-cols-2 gap-5 items-start px-1 pt-4 pb-2 transition-opacity duration-300 ${
              open ? 'opacity-100 delay-100' : 'opacity-0'
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tarjeta que ocupa las dos columnas de la grilla (mapas, selector de colores, tablas anchas). */
function FullWidth({ children }: { children: ReactNode }) {
  return <div className="lg:col-span-2">{children}</div>;
}

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
    { id: 'negocio', title: 'Negocio', icon: <Building2 className="h-4 w-4" /> },
    { id: 'whatsapp', title: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'pagos', title: 'Pagos y moneda', icon: <Wallet className="h-4 w-4" /> },
    { id: 'delivery', title: 'Delivery', icon: <Bike className="h-4 w-4" /> },
    { id: 'apariencia', title: 'Apariencia del menú público', icon: <Palette className="h-4 w-4" /> },
    { id: 'pantalla', title: 'Pantalla', icon: <MonitorPlay className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'equipo', title: 'Equipo y seguridad', icon: <ShieldCheck className="h-4 w-4" /> }] : []),
    { id: 'impresion', title: 'Estación de impresión', icon: <Printer className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'datos', title: 'Datos y reportes', icon: <Database className="h-4 w-4" /> }] : []),
    ...(!isManager ? [{ id: 'seguridad', title: 'Seguridad', icon: <Clock className="h-4 w-4" /> }] : []),
  ];

  // Vacío = todas las categorías cerradas al entrar a Ajustes; el staff abre la que necesite.
  const [openCategory, setOpenCategory] = useState<string>('');

  function selectCategory(id: string) {
    setOpenCategory(id);
    requestAnimationFrame(() => {
      document.getElementById(`ajustes-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function toggleCategory(id: string) {
    setOpenCategory((current) => (current === id ? '' : id));
  }

  const currentCategory = CATEGORIES.find((c) => c.id === openCategory);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Ajustes</h1>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-brand-950/10 bg-white px-4 py-2 text-sm font-medium text-brand-950 shadow-sm hover:bg-brand-950/[0.03]"
            >
              {currentCategory?.icon}
              {currentCategory?.title ?? 'Elige una categoría'}
              <ChevronDown className="h-3.5 w-3.5 text-brand-950/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {CATEGORIES.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => selectCategory(c.id)}>
                {c.icon}
                {c.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SettingsCategory id="negocio" title="Negocio" icon={<Building2 className="h-4 w-4" />} open={openCategory === 'negocio'} onToggle={toggleCategory}>
        <RestaurantInfoSection />
        <DesktopShortcutSection />
        <ScheduleSection />
        {isManager && <FullWidth><ClubLinkSection /></FullWidth>}
      </SettingsCategory>

      <SettingsCategory id="whatsapp" title="WhatsApp" icon={<MessageCircle className="h-4 w-4" />} open={openCategory === 'whatsapp'} onToggle={toggleCategory}>
        <WhatsappMessageSection />
        <WhatsappBotSection />
      </SettingsCategory>

      <SettingsCategory id="pagos" title="Pagos y moneda" icon={<Wallet className="h-4 w-4" />} open={openCategory === 'pagos'} onToggle={toggleCategory}>
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
      </SettingsCategory>

      <SettingsCategory
        id="pantalla"
        title="Pantalla"
        icon={<MonitorPlay className="h-4 w-4" />}
        open={openCategory === 'pantalla'}
        onToggle={toggleCategory}
      >
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
          <DeleteOrderPinSection />
          <LockScreenSettingsSection />
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

      {!isManager && (
        <SettingsCategory
          id="seguridad"
          title="Seguridad"
          icon={<Clock className="h-4 w-4" />}
          open={openCategory === 'seguridad'}
          onToggle={toggleCategory}
        >
          <LockScreenSettingsSection />
        </SettingsCategory>
      )}
    </div>
  );
}
