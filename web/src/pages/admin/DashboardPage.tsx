import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { DemoNotificationSoundsSection } from '@/components/admin/DemoNotificationSoundsSection';
import { GeneralKpisCard } from '@/components/admin/GeneralKpisCard';
import { InventoryAlertsPopup } from '@/components/admin/InventoryAlertsPopup';
import { InventoryByBranchCard } from '@/components/admin/InventoryByBranchCard';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { hasSeenOnboardingTutorial } from '@/components/admin/OnboardingTutorial.shared';
import { SalesDashboard } from '@/components/admin/SalesDashboard';
import { TodayOrdersList } from '@/components/admin/TodayOrdersList';
import { TopProductsCard } from '@/components/admin/TopProductsCard';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { ExpenseFormDialog } from '@/components/admin/ExpenseFormDialog';
import { ArrowLeft,ArrowRight,CircleDollarSign,ClipboardList,ExternalLink,Plus,ShoppingCart,UtensilsCrossed,type LucideIcon } from 'lucide-react';
import { motion,useReducedMotion } from 'motion/react';
import { type ReactNode,useRef,useState,useSyncExternalStore } from 'react';
import { RestaurantDesktopDashboard } from './RestaurantDesktopDashboard';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.shared';
import { canManageTeam,isAdminCashier } from '../../utils/roles';
import { allowsBranches,daysRemaining,graceHoursRemaining,hasFeature } from '../../utils/subscription';
import { dashboardQuickActionLinks,PLAN_LABELS } from './nav-links';

// Colores rotativos para los íconos de "Accesos rápidos" — solo distinguen
// visualmente una sección de otra, no tienen significado propio (a diferencia
// de los chips de estado de pedido/mesa, que sí usan color con significado).
const SHORTCUT_COLORS = [
  'bg-brand-500/10 text-brand-600',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

type QuickAction = { to: string; label: string; icon: LucideIcon };

/** Entrada escalonada del dashboard. Se mueve muy poco para conservar la sensación de
 * respuesta inmediata y, con reducir movimiento, se convierte en un fundido breve. */
function DashboardReveal({ children, order, className }: { children: ReactNode; order: number; className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reduceMotion
          ? { duration: 0.14, delay: Math.min(order, 2) * 0.025 }
          : { type: 'spring', bounce: 0, duration: 0.4, delay: Math.min(order, 6) * 0.06 }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Carrusel nativo con scroll-snap: el gesto conserva el desplazamiento 1:1 del navegador y
 * el elemento más cercano al centro se convierte en la acción destacada, sin retrasar el tap. */
function QuickActionsCarousel({ actions }: { actions: QuickAction[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateActiveFromScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    const items = Array.from(viewport.querySelectorAll<HTMLElement>('[data-quick-action]'));
    let closestIndex = 0;
    let closestDistance = Infinity;
    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
  }

  function centerAction(index: number) {
    const viewport = viewportRef.current;
    const target = viewport?.querySelectorAll<HTMLElement>('[data-quick-action]')[index];
    if (!viewport || !target) return;
    viewport.scrollTo({ left: target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2, behavior: 'smooth' });
    setActiveIndex(index);
  }

  if (actions.length === 0) return null;

  return (
    <div className="relative">
      {/* En teléfono no se oculta ninguna acción detrás de un gesto horizontal. La cuadrícula
          se alimenta del mismo catálogo por permisos que escritorio, así que si se agrega un
          módulo nuevo también aparecerá aquí automáticamente. */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-4 min-[390px]:grid-cols-4 lg:hidden" aria-label="Todas las acciones rápidas">
        {actions.map(({ to, label, icon: Icon }, index) => (
          <Link
            key={to}
            to={to}
            data-quick-action
            className="group flex min-w-0 flex-col items-center text-center transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-[17px] ${SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]}`}>
              <Icon className="h-5.5 w-5.5" />
            </span>
            <span className="mt-2 w-full break-words px-0.5 text-[11px] font-semibold leading-[1.2] tracking-[-0.015em] text-brand-950/75">{label}</span>
          </Link>
        ))}
      </div>

      <div
        ref={viewportRef}
        onScroll={updateActiveFromScroll}
        className="hidden snap-x snap-mandatory gap-3 overflow-x-auto px-[calc(50%-3.5rem)] pb-9 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex"
        aria-label="Carrusel de acciones rápidas"
      >
        {actions.map(({ to, label, icon: Icon }, index) => {
          const isActive = index === activeIndex;
          return (
            <Link
              key={to}
              to={to}
              data-quick-action
              onFocus={() => centerAction(index)}
              aria-current={isActive ? 'true' : undefined}
              className={`group relative flex h-[92px] w-24 shrink-0 snap-center flex-col items-center justify-start text-center transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none ${
                isActive
                  ? 'scale-100 opacity-100'
                  : 'scale-[0.9] opacity-45'
              }`}
            >
              {isActive && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-16 w-16 -translate-x-1/2 rounded-full bg-brand-500/25 blur-2xl" />}
              <span className={`relative flex h-12 w-12 items-center justify-center rounded-[17px] transition-colors duration-150 motion-reduce:transition-none ${
                isActive ? 'bg-brand-500 text-white shadow-[0_13px_26px_-12px_rgba(0,117,255,0.55)]' : SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]
              }`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className={`relative mt-2 text-[12px] font-semibold leading-tight tracking-[-0.015em] ${isActive ? 'text-brand-950' : 'text-brand-950/70'}`}>{label}</span>
            </Link>
          );
        })}
      </div>

      <div className="-mt-5 hidden items-center justify-center gap-1.5 lg:flex" aria-hidden="true">
        {actions.map((action, index) => (
          <span key={action.to} className={`h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${index === activeIndex ? 'w-5 bg-brand-500' : 'w-1.5 bg-brand-950/15'}`} />
        ))}
      </div>

      <div className="absolute -top-10 right-0 hidden items-center gap-1 lg:flex">
        <button type="button" aria-label="Acción anterior" onClick={() => centerAction(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-950/55 shadow-sm disabled:opacity-30 active:scale-95">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Siguiente acción" onClick={() => centerAction(Math.min(actions.length - 1, activeIndex + 1))} disabled={activeIndex === actions.length - 1} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-950/55 shadow-sm disabled:opacity-30 active:scale-95">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const desktopQuery = '(min-width: 1024px)';
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));
  const [adminEntryMode, setAdminEntryMode] = useState<'expense' | 'purchase' | null>(null);

  if (!restaurant) return null;

  const trialDaysLeft = restaurant.subscriptionStatus === 'TRIALING' ? Math.max(0, daysRemaining(restaurant.periodEnd)) : null;
  const planLabel = restaurant.subscriptionPlan ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan) : null;
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);
  // El restaurante de demostración principal tiene slug `demo`; sus sucursales no muestran
  // estos controles para no confundir una prueba con una comanda real.
  const isBigBiteDemo = restaurant.slug === 'demo';

  const quickActions = dashboardQuickActionLinks(
    user?.role,
    restaurant,
    user?.canAccessInventory,
    user?.cashierFullAccess,
  ).map((item) => item.to === '/admin/table-orders' ? { ...item, label: 'Abrir cuenta de mesa', icon: Plus } : item);
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'equipo';

  const expiryLabel =
    trialDaysLeft !== null
      ? `Prueba: ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'}`
      : graceHours !== null
        ? `Vence hoy (${graceHours}h)`
        : daysLeft >= 0
          ? `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
          : 'Plan vencido';

  if (desktop && isAdminCashier(user?.role, user?.cashierFullAccess)) return <>
    <RestaurantDesktopDashboard
      onAddExpense={() => setAdminEntryMode('expense')}
      onAddPurchase={() => setAdminEntryMode('purchase')}
    />
    {adminEntryMode && (
      <ExpenseFormDialog
        mode={adminEntryMode}
        onClose={() => setAdminEntryMode(null)}
        onCreated={() => setAdminEntryMode(null)}
      />
    )}
    {!showTutorial && <InventoryAlertsPopup />}
    {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}
  </>;

  return (
    <div className="py-1 lg:py-2">
      {/* En escritorio la cabecera concentra el estado del turno y los dos caminos más usados.
          En móvil esa función la absorbe la tarjeta de ventas para evitar dos bloques azules. */}
      <DashboardReveal order={0} className="hidden lg:block">
        <section className="relative mb-7 overflow-hidden rounded-[30px] bg-gradient-to-br from-brand-500 via-[#3278ff] to-[#5134e8] px-7 py-6 text-white shadow-[0_18px_42px_rgba(31,93,230,0.23)]">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-[30%] h-32 w-2/3 bg-[radial-gradient(ellipse_at_bottom,_rgba(255,255,255,.18),transparent_65%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <img
                src={restaurant.logoUrl || '/logo/icono.png?v=20261002'}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl border border-white/35 bg-white/90 object-cover shadow-sm"
              />
              <div className="min-w-0">
                <p className="font-medium text-white/70 text-xs">Buen día</p>
                <h1 className="mt-0.5 truncate text-[26px] font-bold leading-tight tracking-[-0.035em]">
                  Hola, {firstName}
                </h1>
                <p className="mt-1 truncate text-white/75 text-base">{restaurant.name}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <DailyRatesBadge />
              <Link
                to="/admin/billing"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-transform active:scale-[0.97] ${
                  daysLeft <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-white/16 text-white'
                }`}
              >
                {planLabel ?? 'Sin plan'} · {expiryLabel}
              </Link>
            </div>
          </div>
          <div className="relative mt-6 flex max-w-3xl gap-3">
            <Link to="/admin/comandas" className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/16 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/24 active:scale-[0.98]">
              <ClipboardList className="h-4 w-4" /> Ver pedidos
            </Link>
            {canManageTeam(user?.role) && <>
              <button type="button" onClick={() => setAdminEntryMode('expense')} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/16 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/24 active:scale-[0.98]">
                <CircleDollarSign className="h-4 w-4" /> Agregar gasto
              </button>
              <button type="button" onClick={() => setAdminEntryMode('purchase')} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-brand-600 shadow-sm transition-transform active:scale-[0.98]">
                <ShoppingCart className="h-4 w-4" /> Agregar compra
              </button>
            </>}
          </div>
        </section>
      </DashboardReveal>

      {isBigBiteDemo && (
        <DashboardReveal order={1} className="mb-6 lg:mb-7">
          <DemoNotificationSoundsSection />
        </DashboardReveal>
      )}

      {isAdminCashier(user?.role, user?.cashierFullAccess) && (
        <DashboardReveal order={2}><SalesDashboard /></DashboardReveal>
      )}

      {isAdminCashier(user?.role, user?.cashierFullAccess) && (
        <DashboardReveal order={2} className="mb-6 lg:hidden">
          <DailySalesSummary />
          <Link
            to="/admin/billing"
            className={`mt-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-xs font-semibold ${
              daysLeft <= 3 ? 'bg-amber-50 text-amber-800' : 'bg-brand-950/[0.045] text-brand-950/55'
            }`}
          >
            <span>{planLabel ?? 'Sin plan'}</span><span>{expiryLabel}</span>
          </Link>
        </DashboardReveal>
      )}

      {quickActions.length > 0 && (
        <DashboardReveal order={3}>
          <section className="mb-6 lg:mb-7" aria-label="Acciones rápidas">
            <div className="mb-3 px-0.5">
              <div>
                <h2 className="text-[16px] font-bold tracking-[-0.015em] text-brand-950">Acciones rápidas</h2>
                <p className="mt-0.5 text-brand-950/45 text-xs">Lo que más usas durante el servicio</p>
              </div>
            </div>
            <QuickActionsCarousel actions={quickActions} />
          </section>
        </DashboardReveal>
      )}

      {/* Escritorio: una sola retícula operacional. Pedidos es el bloque de lectura principal;
          catálogo e inventario comparten una columna secundaria para que el resumen se sienta
          como una superficie coherente, no como una pila de tarjetas aisladas. */}
      {isAdminCashier(user?.role, user?.cashierFullAccess) && (
        <section className="hidden lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)] lg:gap-5" aria-label="Resumen operativo">
          <DashboardReveal order={3}>
            {hasFeature(restaurant, 'administration') && <TodayOrdersList />}
          </DashboardReveal>
          <div className="flex flex-col gap-5">
            {hasFeature(restaurant, 'administration') && <DashboardReveal order={4}><TopProductsCard /></DashboardReveal>}
            {canManageTeam(user?.role) && allowsBranches(restaurant.subscriptionPlan) && !restaurant.parentRestaurantId && (
              <DashboardReveal order={5}><InventoryByBranchCard /></DashboardReveal>
            )}
            <DashboardReveal order={6}>
              <a
                href={`/r/${restaurant.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-[22px] border border-brand-950/[0.06] bg-white/80 px-5 py-4 text-left shadow-[0_10px_30px_-24px_rgba(0,27,67,0.28)] backdrop-blur-xl transition-[background-color,transform,box-shadow] duration-200 ease-out-strong hover:bg-white hover:shadow-[0_14px_34px_-24px_rgba(0,27,67,0.38)] active:scale-[0.985] motion-reduce:transition-none"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500"><UtensilsCrossed className="h-4.5 w-4.5" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-brand-950">Menú público</span>
                    <span className="block mt-0.5 text-xs text-brand-950/45">Abrir la experiencia de tu cliente</span>
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 text-brand-950/35 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
              </a>
            </DashboardReveal>
          </div>
        </section>
      )}

      {/* Celular se mantiene con el flujo y la disposición existentes: KPI primero y pedidos
          accionables inmediatamente después, donde se alcanzan con el pulgar. */}
      <div className="flex flex-col items-center gap-6 text-center lg:hidden">
        {isAdminCashier(user?.role, user?.cashierFullAccess) && !['ESSENTIAL', 'OPERATIONS'].includes(restaurant?.subscriptionPlan ?? '') && (
          <DashboardReveal order={3} className="mt-4 w-full">
            <GeneralKpisCard />
          </DashboardReveal>
        )}
        <div className="w-full">
          <DashboardReveal order={4}><LiveOrdersPanel hideCreateButton /></DashboardReveal>
        </div>
      </div>

      {/* Aviso de inventario en alerta: sale al entrar y vuelve a salir hasta que se resuelva. */}
      {!showTutorial && <InventoryAlertsPopup />}

      {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}

      {adminEntryMode && (
        <ExpenseFormDialog
          mode={adminEntryMode}
          onClose={() => setAdminEntryMode(null)}
          onCreated={() => setAdminEntryMode(null)}
        />
      )}
    </div>
  );
}
