import { useState } from 'react';
import { ArrowLeft, Building2, ChevronDown, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import type { Currency } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { FullWidth, SettingsCategory, scrollToSettingsCategory } from '@/components/admin/SettingsCategory';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { ScheduleSection } from '@/components/admin/ScheduleSection';
import { ShopTeamSection } from './ShopTeamSection';
import { ShopStorefrontSection } from './ShopStorefrontSection';
import { ThemeSection } from '@/components/admin/ThemeSection';
import type { ShopSession } from './shopSession';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';
import { SalesHistoryExportSection } from '@/components/admin/SalesHistoryExportSection';

interface Props {
  onBack: () => void;
  session: ShopSession;
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
 * Ajustes de QuickTap Shop, agrupados en categorías colapsables (mismo patrón
 * que Ajustes de restaurante y de Club, ver SettingsCategory.tsx) con un salto
 * rápido arriba — antes era una fila de ~7 tarjetas sueltas sin ningún acceso
 * directo a la que se necesitaba.
 *
 * Reutiliza las mismas secciones generales del panel de restaurante (datos del
 * negocio, moneda, métodos de pago, horario) — son genéricas, no asumen nada de
 * mesas/cocina/delivery — menos las que sí son solo de restaurante (mensaje de
 * WhatsApp de comanda, PIN de comandas, impresión de tickets de cocina, zonas de
 * delivery, Modo Cartelera). "Cerrar sesión" vive acá en vez de en la barra
 * superior.
 */
export default function ShopSettingsPage({ onBack, session }: Props) {
  const { user, logout } = useAuth();
  const canManageTeam = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const CATEGORIES = [
    { id: 'negocio', title: 'Negocio', icon: <Building2 className="h-4 w-4" /> },
    { id: 'pagos', title: 'Pagos', icon: <Wallet className="h-4 w-4" /> },
    canManageTeam
      ? { id: 'equipo', title: 'Equipo y seguridad', icon: <ShieldCheck className="h-4 w-4" /> }
      : { id: 'seguridad', title: 'Seguridad', icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  // Vacío = todas las categorías cerradas al entrar a Ajustes.
  const [openCategory, setOpenCategory] = useState('');

  function selectCategory(id: string) {
    setOpenCategory(id);
    scrollToSettingsCategory(id);
  }

  function toggleCategory(id: string) {
    setOpenCategory((current) => (current === id ? '' : id));
  }

  const currentCategory = CATEGORIES.find((c) => c.id === openCategory);

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-950/60 hover:text-brand-950 self-start"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al panel
      </button>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-950">Ajustes</h1>

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

      <SettingsCategory
        id="negocio"
        title="Negocio"
        icon={<Building2 className="h-4 w-4" />}
        open={openCategory === 'negocio'}
        onToggle={toggleCategory}
      >
        <RestaurantInfoSection />
        <CurrencySection />
        <FullWidth>
          <ScheduleSection />
        </FullWidth>
      </SettingsCategory>

      <SettingsCategory
        id="pagos"
        title="Pagos"
        icon={<Wallet className="h-4 w-4" />}
        open={openCategory === 'pagos'}
        onToggle={toggleCategory}
      >
        <FullWidth>
          <ShopStorefrontSection session={session} />
        </FullWidth>
        {/* Apariencia de la tienda pública: colores, portada y redes. Es el mismo editor que
            usa el panel de restaurantes para su menú — el tema vive en Restaurant.theme y la
            tienda ya lo lee (ver ShopStorefrontPage), solo faltaba dónde cambiarlo. */}
        <FullWidth>
          <ThemeSection />
        </FullWidth>
        <FullWidth>
          <PaymentMethodsSection descriptionOverride="Elige qué métodos aceptas al cobrar en Venta, y sus datos para que tus clientes sepan a dónde pagar." />
        </FullWidth>
      </SettingsCategory>

      {canManageTeam ? (
        <SettingsCategory
          id="equipo"
          title="Equipo y seguridad"
          icon={<ShieldCheck className="h-4 w-4" />}
          open={openCategory === 'equipo'}
          onToggle={toggleCategory}
        >
          <ShopTeamSection />
          <SalesHistoryExportSection />
          <LockScreenSettingsSection />
        </SettingsCategory>
      ) : (
        <SettingsCategory
          id="seguridad"
          title="Seguridad"
          icon={<ShieldCheck className="h-4 w-4" />}
          open={openCategory === 'seguridad'}
          onToggle={toggleCategory}
        >
          <LockScreenSettingsSection />
        </SettingsCategory>
      )}

      <TextureCard className="mt-3">
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
