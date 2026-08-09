import { lazy, Suspense, useState } from 'react';
import { CalendarDays, LayoutGrid, QrCode, Settings, Ticket } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const ClubCalendarPage = lazy(() => import('./ClubCalendarPage'));
const ClubBookingsPage = lazy(() => import('./ClubBookingsPage'));
const ClubCourtsPage = lazy(() => import('./ClubCourtsPage'));
const ClubCheckInPage = lazy(() => import('./ClubCheckInPage'));
const ClubSettingsPage = lazy(() => import('./ClubSettingsPage'));

export type ClubScreen = 'calendario' | 'reservas' | 'acceso' | 'canchas' | 'ajustes';

const TABS: { id: ClubScreen; label: string; icon: typeof CalendarDays }[] = [
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'reservas', label: 'Reservas', icon: Ticket },
  { id: 'acceso', label: 'Acceso', icon: QrCode },
  { id: 'canchas', label: 'Canchas', icon: LayoutGrid },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

// Configurar canchas, horarios y precios es de administración; recepción opera el
// día a día (calendario, reservas, escáner). Mismo criterio que ShopLayout, que
// concentra su gating de rol en una sola constante.
const ADMIN_ONLY: ClubScreen[] = ['canchas', 'ajustes'];

/**
 * Panel del club deportivo (businessType = SPORTS_CLUB). Igual que ShopLayout,
 * no usa react-router: la pantalla activa es estado local, porque el panel entero
 * cuelga de un único punto de entrada en AdminLayout.
 */
export default function ClubLayout() {
  const { user, restaurant, logout } = useAuth();
  const [screen, setScreen] = useState<ClubScreen>('calendario');

  if (!user || !restaurant) return null;

  const isAdmin = user.role === 'OWNER' || user.role === 'ADMIN';
  const tabs = TABS.filter((t) => isAdmin || !ADMIN_ONLY.includes(t.id));
  const active = tabs.some((t) => t.id === screen) ? screen : 'calendario';

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-20 bg-white pt-[env(safe-area-inset-top)] border-b border-brand-950/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-4">
          <p className="font-bold text-brand-950 truncate">{restaurant.name}</p>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            CLUB
          </span>

          <nav className="hidden lg:flex items-center gap-1 ml-auto bg-brand-950/[0.05] p-1 rounded-full">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setScreen(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  active === t.id ? 'bg-white shadow-sm text-brand-950' : 'text-brand-950/50 hover:text-brand-950',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={logout}
            className="ml-auto lg:ml-0 shrink-0 text-[13px] font-medium text-brand-950/50 hover:text-brand-950"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-6 py-5 pb-28 lg:pb-8">
        <Suspense fallback={<p className="text-brand-950/40 font-light">Cargando…</p>}>
          {active === 'calendario' && <ClubCalendarPage restaurant={restaurant} />}
          {active === 'reservas' && <ClubBookingsPage restaurant={restaurant} />}
          {active === 'acceso' && <ClubCheckInPage />}
          {active === 'canchas' && <ClubCourtsPage restaurant={restaurant} />}
          {active === 'ajustes' && <ClubSettingsPage />}
        </Suspense>
      </main>

      {/* Dock móvil, igual que en Locales: 5 iconos es el máximo cómodo. */}
      <nav className="lg:hidden fixed bottom-5 inset-x-0 z-30 px-5">
        <div className="mx-auto flex max-w-md items-center justify-around rounded-full bg-white/90 backdrop-blur-md border border-brand-950/[0.08] shadow-lg shadow-brand-950/10 px-3 py-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setScreen(t.id)}
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
