import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Nfc, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { daysRemaining } from '../../utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { hasSeenOnboardingTutorial, OnboardingTutorial } from '@/components/admin/OnboardingTutorial';
import { DailySalesSummary } from '@/components/admin/DailySalesSummary';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { QrNfcQuoteDialog } from '@/components/admin/QrNfcQuoteDialog';
import { dashboardSectionLinks } from './nav-links';

const PLAN_LABELS: Record<string, string> = {
  DELIVERY: 'Solo Delivery',
  STARTER: 'Plan Inicial',
  PRO: 'Plan Pro',
  PREMIUM: 'Plan Premium',
  CUSTOM: 'Plan Personalizado',
};

export default function DashboardPage() {
  const { user, restaurant } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !!restaurant && !hasSeenOnboardingTutorial(restaurant.id));
  const [showQrNfcQuote, setShowQrNfcQuote] = useState(false);

  if (!restaurant) return null;

  const publicUrl = `${window.location.origin}/r/${restaurant.slug}`;
  const sections = dashboardSectionLinks(user?.role, restaurant.subscriptionPlan);
  const trialDaysLeft = restaurant.subscriptionStatus === 'TRIALING' ? Math.max(0, daysRemaining(restaurant.periodEnd)) : null;
  const planLabel = restaurant.subscriptionPlan ? (PLAN_LABELS[restaurant.subscriptionPlan] ?? restaurant.subscriptionPlan) : null;

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

      <LiveOrdersPanel />

      <div className="w-full max-w-md mb-4 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 space-y-3">
        <div className="flex items-center gap-3 text-left">
          <Clock className="h-8 w-8 text-brand-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-brand-950">
              {trialDaysLeft !== null
                ? `Prueba gratuita: ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'} restante${trialDaysLeft === 1 ? '' : 's'}`
                : `Mi plan: ${planLabel ?? 'sin definir'}`}
            </p>
            <p className="text-xs text-brand-950/50 font-light">
              {trialDaysLeft !== null ? 'Elige un plan cuando quieras.' : 'Cambia de plan o amplía tu capacidad cuando quieras.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/billing" className="flex-1">
            <TextureButton variant="brand" size="sm">
              {trialDaysLeft !== null ? 'Activar plan' : 'Actualizar plan'}
            </TextureButton>
          </Link>
          <Link to="/admin/billing?custom=1" className="flex-1">
            <TextureButton variant="secondary" size="sm">
              Añadir a mi plan
            </TextureButton>
          </Link>
        </div>
      </div>

      <button
        onClick={() => setShowQrNfcQuote(true)}
        className="w-full max-w-md mb-8 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 flex items-center gap-3 hover:shadow-md transition-shadow duration-300 text-left"
      >
        <Nfc className="h-8 w-8 text-brand-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-brand-950">Cotiza tus QR NFC</p>
          <p className="text-xs text-brand-950/50 font-light">QR físicos impermeables con protección UV, desde $5 c/u.</p>
        </div>
      </button>

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
      {showQrNfcQuote && <QrNfcQuoteDialog onClose={() => setShowQrNfcQuote(false)} />}
    </div>
  );
}
