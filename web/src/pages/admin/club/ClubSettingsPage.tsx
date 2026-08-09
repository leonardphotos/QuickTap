import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent } from '@/components/ui/texture-card';
import { RestaurantInfoSection } from '@/components/admin/RestaurantInfoSection';
import { PaymentMethodsSection } from '@/components/admin/PaymentMethodsSection';
import { LockScreenSettingsSection } from '@/components/admin/LockScreenSettingsSection';
import { canManageTeam } from '@/utils/roles';
import { ClubBrandingSection } from './ClubBrandingSection';
import ClubCourtsPage from './ClubCourtsPage';
import { ClubKitchenLinkSection } from './ClubKitchenLinkSection';
import { ClubTabletsSection } from './ClubTabletsSection';

/**
 * Ajustes del club. Reutiliza las mismas secciones generales del panel de
 * restaurante: son genéricas, no asumen nada de mesas ni cocina (mismo criterio
 * que ShopSettingsPage).
 */
export default function ClubSettingsPage() {
  const { user, restaurant, logout } = useAuth();
  if (!user || !restaurant) return null;

  const publicUrl = `${window.location.origin}/club/${restaurant.slug}`;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">Ajustes</h1>

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

      <RestaurantInfoSection />

      {/* Canchas y horarios: sin esto el club no puede recibir una sola reserva,
          así que va antes que cualquier otro ajuste. */}
      {canManageTeam(user.role) && (
        <TextureCard>
          <TextureCardContent className="py-5">
            <ClubCourtsPage restaurant={restaurant} />
          </TextureCardContent>
        </TextureCard>
      )}

      <ClubBrandingSection />
      {canManageTeam(user.role) && <ClubKitchenLinkSection />}
      {canManageTeam(user.role) && <ClubTabletsSection />}
      <PaymentMethodsSection descriptionOverride="Elige qué métodos aceptas al cobrar una reserva, y sus datos para que tus jugadores sepan a dónde pagar." />
      {canManageTeam(user.role) && <LockScreenSettingsSection />}

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
