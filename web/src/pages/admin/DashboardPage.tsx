import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isAdminCashier } from '../../utils/roles';
import { daysRemaining, graceHoursRemaining } from '../../utils/subscription';
import { hasSeenOnboardingTutorial, OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { NavMenuDrawer } from '@/components/admin/NavMenuDrawer';
import { TextureButton } from '@/components/ui/texture-button';

const PLAN_LABELS: Record<string, string> = {
  DELIVERY: 'Solo Delivery',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro',
  PREMIUM: 'Plan Premium',
  CUSTOM: 'Plan Personalizado',
  SUCURSALES: 'Plan Sucursales',
  DELIVERY_SUCURSALES: 'Delivery Sucursales',
};

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));
  const [menuOpen, setMenuOpen] = useState(false);

  if (!restaurant) return null;

  const trialDaysLeft = restaurant.subscriptionStatus === 'TRIALING' ? Math.max(0, daysRemaining(restaurant.periodEnd)) : null;
  const planLabel = restaurant.subscriptionPlan ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan) : null;
  const daysLeft = daysRemaining(restaurant.periodEnd);
  const graceHours = graceHoursRemaining(restaurant.periodEnd);

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

      <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:text-left lg:gap-8">
        <div className="lg:w-72 lg:shrink-0 lg:sticky lg:top-24 flex flex-col items-center lg:items-stretch">
          <a href={`/r/${restaurant.slug}`} target="_blank" rel="noopener noreferrer" className="mb-4 lg:self-start">
            <TextureButton variant="minimal" size="sm" className="!w-auto px-4">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver mi menú
            </TextureButton>
          </a>
          {isAdminCashier(user?.role) && <DailySalesSummary />}
        </div>
        <div className="w-full lg:flex-1 lg:min-w-0">
          <LiveOrdersPanel />
        </div>
      </div>

      <NavMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
