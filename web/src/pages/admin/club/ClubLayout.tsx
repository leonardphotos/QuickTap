import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, GraduationCap, LayoutGrid, QrCode, Settings, ShoppingBag, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { daysRemaining, graceHoursRemaining } from '@/utils/subscription';
import { cn } from '@/lib/utils';

const ClubCourtsLivePage = lazy(() => import('./ClubCourtsLivePage'));
const ClubCourtDetailPage = lazy(() => import('./ClubCourtDetailPage'));
const ClubStorePage = lazy(() => import('./ClubStorePage'));
const ClubAdminPage = lazy(() => import('./ClubAdminPage'));
const ClubCheckInPage = lazy(() => import('./ClubCheckInPage'));
const ClubSettingsPage = lazy(() => import('./ClubSettingsPage'));
const ClubAcademyPage = lazy(() => import('./academia/ClubAcademyPage'));
const ClubPlayersPage = lazy(() => import('./jugadores/ClubPlayersPage'));
const ClubBillingPage = lazy(() => import('./ClubBillingPage'));

export type ClubScreen = 'canchas' | 'academia' | 'jugadores' | 'tienda' | 'admin' | 'acceso' | 'ajustes' | 'facturacion';

const TABS: { id: ClubScreen; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'canchas', label: 'Canchas', icon: LayoutGrid },
  { id: 'academia', label: 'Academia', icon: GraduationCap },
  { id: 'jugadores', label: 'Jugadores', icon: Users },
  { id: 'tienda', label: 'Tienda', icon: ShoppingBag },
  { id: 'admin', label: 'Administración', icon: Wallet },
  { id: 'acceso', label: 'Acceso', icon: QrCode },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
  { id: 'facturacion', label: 'Facturación', icon: CreditCard },
];

// Configurar canchas, precios y equipo, y pagar la mensualidad, es del dueño/admin; recepción
// opera el día a día. Todo el gating de rol de la vertical se concentra acá.
const ADMIN_ONLY: ClubScreen[] = ['ajustes', 'facturacion'];

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
  const [searchParams] = useSearchParams();
  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=CLUB&cycle=Y, o de
  // vuelta del checkout de Ramblay): arranca directo en Facturación en vez de Canchas.
  const [screen, setScreen] = useState<ClubScreen>(() =>
    searchParams.get('plan') === 'CLUB' || searchParams.get('ramblay') === 'success' ? 'facturacion' : 'canchas',
  );
  // Cancha abierta desde la pantalla de Canchas: su detalle reemplaza la grilla.
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);

  if (!user || !restaurant) return null;

  const isAdmin = user.role === 'OWNER' || user.role === 'ADMIN';
  const tabs = TABS.filter((t) => isAdmin || !ADMIN_ONLY.includes(t.id));
  const active = tabs.some((t) => t.id === screen) ? screen : 'canchas';
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  const showExpirationWarning = isAdmin && daysLeft <= 3;

  function go(next: ClubScreen) {
    setOpenCourtId(null);
    setScreen(next);
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {showExpirationWarning && (
        <button
          type="button"
          onClick={() => go('facturacion')}
          className="block w-full bg-amber-400 text-amber-950 text-sm font-medium text-center py-2 px-4 hover:bg-amber-300 transition-colors"
        >
          {graceHours !== null
            ? `Hoy vence tu plan. Tienes ${graceHours}h para pagar antes de que se bloquee tu cuenta.`
            : `En ${daysLeft} día${daysLeft === 1 ? '' : 's'} vence tu plan. Actívalo aquí.`}
        </button>
      )}

      <header className="sticky top-0 z-20 bg-white pt-[env(safe-area-inset-top)] border-b border-brand-950/[0.06]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:px-6">
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

      {/* max-w-7xl y no 6xl: la vertical se lee en tabla, y con seis columnas el
          ancho extra es justo el que evita que se aprieten los encabezados. */}
      <main className="mx-auto max-w-7xl px-5 py-5 pb-28 sm:px-6 lg:py-7 lg:pb-10">
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
          {active === 'academia' && <ClubAcademyPage restaurant={restaurant} isAdmin={isAdmin} />}
          {active === 'jugadores' && <ClubPlayersPage restaurant={restaurant} isAdmin={isAdmin} />}
          {active === 'tienda' && <ClubStorePage restaurant={restaurant} canSeeMoney={isAdmin || user.role === 'CASHIER'} />}
          {active === 'admin' && <ClubAdminPage restaurant={restaurant} canSeeMoney={isAdmin} />}
          {active === 'acceso' && <ClubCheckInPage />}
          {active === 'ajustes' && <ClubSettingsPage />}
          {active === 'facturacion' && <ClubBillingPage restaurant={restaurant} onDone={() => go('canchas')} />}
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
