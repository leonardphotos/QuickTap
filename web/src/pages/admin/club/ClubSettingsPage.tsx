import { useState } from 'react';
import { Building2, ChevronDown, CircleDot, LogOut, Palette, ShieldCheck, Tablet, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { FullWidth, SettingsCategory, scrollToSettingsCategory } from '@/components/admin/SettingsCategory';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';
import { canManageTeam } from '@/utils/roles';
import { ClubBrandingSection } from './ClubBrandingSection';
import ClubCourtsPage from './ClubCourtsPage';
import { ClubKitchenLinkSection } from './ClubKitchenLinkSection';
import { ClubTabletsSection } from './ClubTabletsSection';

/**
 * Ajustes del club, agrupados en categorías colapsables (mismo patrón que
 * Ajustes de restaurante, ver SettingsCategory.tsx) con un salto rápido arriba
 * — antes era una fila de ~8 tarjetas sueltas una debajo de otra, sin ningún
 * acceso directo a la que se necesitaba.
 */
export default function ClubSettingsPage() {
  const { user, restaurant, logout } = useAuth();
  const isManager = canManageTeam(user?.role);

  const CATEGORIES = [
    { id: 'negocio', title: 'Negocio', icon: <Building2 className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'canchas', title: 'Canchas y horarios', icon: <CircleDot className="h-4 w-4" /> }] : []),
    { id: 'apariencia', title: 'Apariencia del enlace público', icon: <Palette className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'vinculo', title: 'Restaurante vinculado y tablets', icon: <Tablet className="h-4 w-4" /> }] : []),
    { id: 'pagos', title: 'Pagos', icon: <Wallet className="h-4 w-4" /> },
    ...(isManager ? [{ id: 'seguridad', title: 'Seguridad', icon: <ShieldCheck className="h-4 w-4" /> }] : []),
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

  if (!user || !restaurant) return null;

  const publicUrl = `${window.location.origin}/club/${restaurant.slug}`;
  const currentCategory = CATEGORIES.find((c) => c.id === openCategory);

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">Ajustes</h1>

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
        <FullWidth>
          <TextureCard>
            <TextureCardContent className="py-5">
              <p className="text-sm font-semibold text-brand-950">Enlace de reservas</p>
              <p className="mt-0.5 text-xs text-brand-950/50 font-light">
                Compártelo con tus jugadores: desde ahí ven la disponibilidad y reservan solos, 24/7.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-brand-950/[0.04] px-3 py-2 text-[13px] text-brand-950">
                  {publicUrl}
                </code>
                <TextureButton
                  variant="minimal"
                  size="default"
                  className="!w-auto shrink-0"
                  onClick={() => navigator.clipboard?.writeText(publicUrl)}
                >
                  Copiar
                </TextureButton>
              </div>
            </TextureCardContent>
          </TextureCard>
        </FullWidth>
        <RestaurantInfoSection />
      </SettingsCategory>

      {/* Canchas y horarios: sin esto el club no puede recibir una sola reserva,
          así que va justo después de los datos del negocio. */}
      {isManager && (
        <SettingsCategory
          id="canchas"
          title="Canchas y horarios"
          icon={<CircleDot className="h-4 w-4" />}
          open={openCategory === 'canchas'}
          onToggle={toggleCategory}
        >
          <FullWidth>
            <TextureCard>
              <TextureCardContent className="py-5">
                <ClubCourtsPage restaurant={restaurant} />
              </TextureCardContent>
            </TextureCard>
          </FullWidth>
        </SettingsCategory>
      )}

      <SettingsCategory
        id="apariencia"
        title="Apariencia del enlace público"
        icon={<Palette className="h-4 w-4" />}
        open={openCategory === 'apariencia'}
        onToggle={toggleCategory}
      >
        <FullWidth>
          <ClubBrandingSection />
        </FullWidth>
      </SettingsCategory>

      {isManager && (
        <SettingsCategory
          id="vinculo"
          title="Restaurante vinculado y tablets"
          icon={<Tablet className="h-4 w-4" />}
          open={openCategory === 'vinculo'}
          onToggle={toggleCategory}
        >
          <ClubKitchenLinkSection />
          <ClubTabletsSection />
        </SettingsCategory>
      )}

      <SettingsCategory
        id="pagos"
        title="Pagos"
        icon={<Wallet className="h-4 w-4" />}
        open={openCategory === 'pagos'}
        onToggle={toggleCategory}
      >
        <FullWidth>
          <PaymentMethodsSection descriptionOverride="Elige qué métodos aceptas al cobrar una reserva, y sus datos para que tus jugadores sepan a dónde pagar." />
        </FullWidth>
      </SettingsCategory>

      {isManager && (
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
