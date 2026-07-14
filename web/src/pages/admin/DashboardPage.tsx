import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { daysRemaining } from '../../utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { hasSeenOnboardingTutorial, OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { dashboardSectionLinks } from './nav-links';

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));

  if (!restaurant) return null;

  const publicUrl = `${window.location.origin}/r/${restaurant.slug}`;
  const sections = dashboardSectionLinks(user?.role);
  const trialDaysLeft = restaurant.subscriptionStatus === 'TRIALING' ? Math.max(0, daysRemaining(restaurant.periodEnd)) : null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silencioso: el navegador puede negar el permiso de portapapeles.
    }
  }

  return (
    <div className="flex flex-col items-center text-center py-4">
      <img
        src={restaurant.logoUrl || '/logo/icono.png'}
        alt=""
        className="h-24 w-24 rounded-full object-cover shadow-sm mb-6"
      />
      <h1 className="text-2xl font-semibold text-brand-950 mb-2">{restaurant.name}</h1>
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 text-sm text-brand-950/50 hover:text-brand-500 transition-colors mb-10"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" /> Enlace copiado
          </>
        ) : (
          <>
            <Share2 className="h-3.5 w-3.5" /> Compartir enlace del menú
          </>
        )}
      </button>

      <DailySalesSummary />

      {trialDaysLeft !== null && (
        <div className="w-full max-w-md mb-8 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-left">
            <Clock className="h-8 w-8 text-brand-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-brand-950">
                Prueba gratuita: {trialDaysLeft} día{trialDaysLeft === 1 ? '' : 's'} restante
                {trialDaysLeft === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-brand-950/50 font-light">Elige un plan cuando quieras.</p>
            </div>
          </div>
          <Link to="/admin/billing" className="shrink-0">
            <TextureButton variant="brand" size="sm" className="!w-auto px-4">
              Activar plan
            </TextureButton>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        {sections.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="aspect-square rounded-3xl border border-brand-950/[0.06] bg-white shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col items-center justify-center gap-3"
          >
            <s.icon className="h-9 w-9 text-brand-500" />
            <span className="text-base font-medium text-brand-950">{s.label}</span>
          </Link>
        ))}
      </div>

      {showTutorial && <OnboardingTutorial restaurantId={restaurant.id} onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
