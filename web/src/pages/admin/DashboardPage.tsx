import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ExternalLink, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canManageTeam, isAdminCashier } from '../../utils/roles';
import { allowsBranches, daysRemaining, graceHoursRemaining, hasFeature } from '../../utils/subscription';
import { hasSeenOnboardingTutorial, OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { InventoryAlertsPopup } from '@/components/admin/InventoryAlertsPopup';
import { GeneralKpisCard } from '@/components/admin/GeneralKpisCard';
import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { SalesDashboard } from '@/components/admin/SalesDashboard';
import { TodayOrdersList } from '@/components/admin/TodayOrdersList';
import { TopProductsCard } from '@/components/admin/TopProductsCard';
import { InventoryByBranchCard } from '@/components/admin/InventoryByBranchCard';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { NavMenuDrawer } from '@/components/admin/NavMenuDrawer';
import { TextureButton } from '@/components/ui/texture-button';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { dashboardSectionLinks, PLAN_LABELS } from './nav-links';

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

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));
  const [menuOpen, setMenuOpen] = useState(false);
  // El diálogo lo monta LiveOrdersPanel; acá solo vive el botón que lo abre (ver más abajo).
  const [createOrderOpen, setCreateOrderOpen] = useState(false);

  if (!restaurant) return null;

  const trialDaysLeft = restaurant.subscriptionStatus === 'TRIALING' ? Math.max(0, daysRemaining(restaurant.periodEnd)) : null;
  const planLabel = restaurant.subscriptionPlan ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan) : null;
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);

  const shortcuts = dashboardSectionLinks(user?.role, restaurant, user?.canAccessInventory, user?.cashierFullAccess);

  const expiryLabel =
    trialDaysLeft !== null
      ? `Prueba: ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'}`
      : graceHours !== null
        ? `Vence hoy (${graceHours}h)`
        : daysLeft >= 0
          ? `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
          : 'Plan vencido';

  return (
    <div className="py-2">
      {/* En pantallas anchas la barra superior de AdminLayout ya muestra el logo y el
          nombre del restaurante — aquí solo queda el badge de plan + vencimiento, sin duplicar. */}
      <div className="flex items-start justify-between gap-3 mb-8">
        <Link to="/admin/billing" className="flex items-center gap-3 min-w-0 lg:hidden">
          <img
            src={restaurant.logoUrl || '/logo/icono.png'}
            alt=""
            className="h-12 w-12 rounded-full object-cover shadow-sm shrink-0"
          />
          <div className="min-w-0 text-left">
            <p className="text-base font-semibold text-brand-950 truncate">{restaurant.name}</p>
            <span className="inline-block text-xs font-medium text-brand-500 bg-brand-500/10 rounded-full px-2 py-0.5 mt-0.5">
              {planLabel ?? 'Sin plan'}
            </span>
          </div>
        </Link>

        <Link
          to="/admin/billing"
          className="hidden lg:inline-block text-xs font-medium text-brand-500 bg-brand-500/10 rounded-full px-2.5 py-1"
        >
          {planLabel ?? 'Sin plan'}
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <DailyRatesBadge />
          <Link
            to="/admin/billing"
            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
              daysLeft <= 3 ? 'bg-amber-100 text-amber-700' : 'text-brand-950/50 bg-brand-950/[0.06]'
            }`}
          >
            {expiryLabel}
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="lg:hidden h-9 w-9 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center shrink-0"
          >
            <Menu className="h-4.5 w-4.5 text-brand-950/70" />
          </button>
        </div>
      </div>

      {isAdminCashier(user?.role, user?.cashierFullAccess) && <SalesDashboard />}

      <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:text-left lg:gap-8">
        <div className="lg:w-72 lg:shrink-0 lg:sticky lg:top-24 flex flex-col items-center lg:items-stretch">
          {/* Celular: "Crear pedido" es la acción principal del turno, así que va arriba de todo.
              En escritorio este lugar lo sigue ocupando "Ver mi menú" — allí no hay cuadrícula de
              accesos rápidos donde reubicarlo, y la cola de pedidos vive aparte en Comandas. */}
          <button
            onClick={() => setCreateOrderOpen(true)}
            className="lg:hidden mb-4 w-full max-w-xs flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-3 shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Crear pedido
          </button>

          <a
            href={`/r/${restaurant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:block mb-4 lg:self-start"
          >
            <TextureButton variant="minimal" size="sm" className="!w-auto">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver mi menú
            </TextureButton>
          </a>
          {isAdminCashier(user?.role, user?.cashierFullAccess) && <DailySalesSummary />}

          {/* KPI del negocio: va justo debajo de "Ventas de hoy" y se puede plegar, para que
              quien solo quiere cobrar no tenga los indicadores encima todo el día. */}
          {isAdminCashier(user?.role, user?.cashierFullAccess) && (
            <div className="mt-4 w-full">
              <GeneralKpisCard />
            </div>
          )}

          {/* Solo en celular: en escritorio ya está la barra lateral con estas mismas
              secciones, así que esta cuadrícula sería redundante ahí. */}
          {shortcuts.length > 0 && (
            <div className="w-full mt-5 lg:hidden">
              <h3 className="text-sm font-semibold text-brand-950/70 mb-3 text-left">Accesos rápidos</h3>
              <div className="grid grid-cols-4 gap-3">
                {shortcuts.map(({ to, label, icon: Icon }, i) => (
                  <Link key={to} to={to} className="flex flex-col items-center gap-1.5 text-center">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${SHORTCUT_COLORS[i % SHORTCUT_COLORS.length]}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-medium text-brand-950/70 leading-tight">{label}</span>
                  </Link>
                ))}
                {/* El menú público no es una sección del panel (abre en otra pestaña), por eso
                    va acá suelto y no dentro de dashboardSectionLinks. */}
                <a
                  href={`/r/${restaurant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      SHORTCUT_COLORS[shortcuts.length % SHORTCUT_COLORS.length]
                    }`}
                  >
                    <ExternalLink className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-medium text-brand-950/70 leading-tight">Ver mi menú</span>
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="w-full lg:flex-1 lg:min-w-0">
          {/* Celular: los pedidos accionables (aceptar, cambiar estado) siguen aquí mismo —
              en escritorio esa cola en vivo vive aparte en Comandas, y este espacio pasa a
              ser el resto de "Resumen": pedidos de hoy de solo lectura, productos más
              vendidos e inventario por sucursal. */}
          <div className="lg:hidden">
            <LiveOrdersPanel
              hideCreateButton
              createOrderOpen={createOrderOpen}
              onCreateOrderOpenChange={setCreateOrderOpen}
            />
          </div>
          {isAdminCashier(user?.role, user?.cashierFullAccess) && (
            <div className="hidden lg:flex lg:flex-col lg:gap-5">
              {hasFeature(restaurant, 'administration') && <TodayOrdersList />}
              {hasFeature(restaurant, 'administration') && <TopProductsCard />}
              {canManageTeam(user?.role) && allowsBranches(restaurant.subscriptionPlan) && !restaurant.parentRestaurantId && (
                <InventoryByBranchCard />
              )}
            </div>
          )}
        </div>
      </div>

      <NavMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Aviso de inventario en alerta: sale al entrar y vuelve a salir hasta que se resuelva. */}
      {!showTutorial && <InventoryAlertsPopup />}

      {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
