import { lazy, Suspense, useState } from 'react';
import { LayoutGrid, QrCode, Settings, ShoppingBag, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const ClubCourtsLivePage = lazy(() => import('./ClubCourtsLivePage'));
const ClubCourtDetailPage = lazy(() => import('./ClubCourtDetailPage'));
const ClubStorePage = lazy(() => import('./ClubStorePage'));
const ClubAdminPage = lazy(() => import('./ClubAdminPage'));
const ClubCheckInPage = lazy(() => import('./ClubCheckInPage'));
const ClubSettingsPage = lazy(() => import('./ClubSettingsPage'));

export type ClubScreen = 'canchas' | 'tienda' | 'admin' | 'acceso' | 'ajustes';

const TABS: { id: ClubScreen; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'canchas', label: 'Canchas', icon: LayoutGrid },
  { id: 'tienda', label: 'Tienda', icon: ShoppingBag },
  { id: 'admin', label: 'Administración', icon: Wallet },
  { id: 'acceso', label: 'Acceso', icon: QrCode },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

// Configurar canchas, precios y equipo es del dueño/admin; recepción opera el día
// a día. Todo el gating de rol de la vertical se concentra acá.
const ADMIN_ONLY: ClubScreen[] = ['ajustes'];

/**
 * Panel del club (businessType = SPORTS_CLUB). Blanco/azul, la misma línea
 * gráfica de todo el panel QuickTap (ver ShopLayout) — los colores propios del
 * club (elegidos en Ajustes → Marca del enlace de reservas) solo pintan el
 * enlace público del jugador y su ticket QR, no este panel interno.
 *
 * Igual que ShopLayout, no usa react-router: la pantalla activa es estado local,
 * porque el panel entero cuelga de un único punto de entrada en AdminLayout.
 */
export default function ClubLayout() {
  const { user, restaurant, logout } = useAuth();
  const [screen, setScreen] = useState<ClubScreen>('canchas');
  // Cancha abierta desde la pantalla de Canchas: su detalle reemplaza la grilla.
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);

  if (!user || !restaurant) return null;

  const isAdmin = user.role === 'OWNER' || user.role === 'ADMIN';
  const tabs = TABS.filter((t) => isAdmin || !ADMIN_ONLY.includes(t.id));
  const active = tabs.some((t) => t.id === screen) ? screen : 'canchas';

  function go(next: ClubScreen) {
    setOpenCourtId(null);
    setScreen(next);
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 bg-white pt-[env(safe-area-inset-top)] border-b border-brand-950/[0.06]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-6">
          <p className="truncate font-bold text-brand-950">{restaurant.name}</p>
          <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-500">
            Club
          </span>

          <nav className="ml-auto hidden items-center gap-1 rounded-full bg-brand-950/[0.05] p-1 lg:flex">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  active === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={logout}
            className="ml-auto shrink-0 text-[13px] font-medium text-brand-950/50 hover:text-brand-950 lg:ml-0"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-5 pb-28 sm:px-6 lg:pb-8">
        <Suspense fallback={<p className="font-light text-brand-950/40">Cargando…</p>}>
          {active === 'canchas' &&
            (openCourtId ? (
              <ClubCourtDetailPage
                courtId={openCourtId}
                restaurant={restaurant}
                canBook={isAdmin || user.role === 'CASHIER'}
                onBack={() => setOpenCourtId(null)}
              />
            ) : (
              <ClubCourtsLivePage
                restaurant={restaurant}
                onOpenCourt={setOpenCourtId}
                canPay={isAdmin || user.role === 'CASHIER'}
              />
            ))}
          {active === 'tienda' && <ClubStorePage restaurant={restaurant} canSeeMoney={isAdmin || user.role === 'CASHIER'} />}
          {active === 'admin' && <ClubAdminPage restaurant={restaurant} canSeeMoney={isAdmin} />}
          {active === 'acceso' && <ClubCheckInPage />}
          {active === 'ajustes' && <ClubSettingsPage />}
        </Suspense>
      </main>

      {/* Dock móvil: 5 iconos es el máximo cómodo, igual que en Locales. */}
      <nav className="fixed inset-x-0 bottom-5 z-30 px-5 lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-full bg-white/90 backdrop-blur-md border border-brand-950/[0.08] shadow-lg shadow-brand-950/10 px-3 py-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                active === t.id ? 'bg-brand-950 text-white' : 'text-brand-950/45',
              )}
              aria-label={t.label}
            >
              <t.icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
