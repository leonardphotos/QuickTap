import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Nfc, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { daysRemaining, graceHoursRemaining } from '../../utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { hasSeenOnboardingTutorial, OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { QrNfcQuoteDialog } from '@/components/admin/QrNfcQuoteDialog';
import { visibleNavLinks } from './nav-links';

const PLAN_LABELS: Record<string, string> = {
  DELIVERY: 'Solo Delivery',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro',
  PREMIUM: 'Plan Premium',
  CUSTOM: 'Plan Personalizado',
};

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));
  const [showQrNfcQuote, setShowQrNfcQuote] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!restaurant) return null;

  const links = visibleNavLinks(user?.role, restaurant.subscriptionPlan);
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
      <div className="flex items-start justify-between gap-3 mb-8">
        <Link to="/admin/billing" className="flex items-center gap-3 min-w-0">
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
            className="h-9 w-9 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center shrink-0"
          >
            <Menu className="h-4.5 w-4.5 text-brand-950/70" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <DailySalesSummary />
        <LiveOrdersPanel />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-xl p-5 space-y-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-brand-950">Menú</p>
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar">
                <X className="h-5 w-5 text-brand-950/50" />
              </button>
            </div>

            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-950/[0.05] transition-colors"
              >
                <l.icon className="h-5 w-5 text-brand-500 shrink-0" />
                <span className="text-sm font-medium text-brand-950">{l.label}</span>
              </Link>
            ))}

            <button
              onClick={() => {
                setMenuOpen(false);
                setShowQrNfcQuote(true);
              }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-950/[0.05] transition-colors text-left"
            >
              <Nfc className="h-5 w-5 text-brand-500 shrink-0" />
              <span className="text-sm font-medium text-brand-950">Cotiza tus QR NFC</span>
            </button>

            <Link
              to="/admin/billing"
              onClick={() => setMenuOpen(false)}
              className="block mt-4"
            >
              <TextureButton variant="brand" size="sm">
                {trialDaysLeft !== null ? 'Activar plan' : 'Actualizar plan'}
              </TextureButton>
            </Link>
          </div>
        </div>
      )}

      {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}
      {showQrNfcQuote && <QrNfcQuoteDialog onClose={() => setShowQrNfcQuote(false)} />}
    </div>
  );
}
