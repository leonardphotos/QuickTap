import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, PartyPopper } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { PLAN_CONTENT } from '@/components/landing/PlanCards';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Pantalla única mostrada justo después de que se activa/cambia un plan
 * (pago manual aprobado o webhook de Ramblay) — ver Restaurant.pendingWelcomePlan.
 * Paso 1: "Bienvenido al Club". Paso 2: detalle del plan activado.
 */
export default function WelcomePage() {
  const { restaurant, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    const timer = setTimeout(() => setStep(2), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return null;
  if (!restaurant) return <Navigate to="/admin/login" replace />;
  if (!restaurant.pendingWelcomePlan) return <Navigate to="/admin" replace />;

  const plan = PLAN_CONTENT.find((p) => p.id === restaurant.pendingWelcomePlan);

  async function goToPanel() {
    await api.patch('/restaurant/welcome-seen');
    await refresh();
    navigate('/admin');
  }

  return (
    <div className="min-h-screen bg-brand-950 flex items-center justify-center px-6 py-12">
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="text-center"
          >
            <PartyPopper className="h-12 w-12 text-brand-400 mx-auto mb-4" />
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">Bienvenido al Club</h1>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-md"
          >
            <div className="rounded-2xl bg-white p-7 sm:p-8 shadow-2xl">
              <p className="text-xs font-medium text-brand-500 uppercase tracking-wide">Tu plan está activo</p>
              <h2 className="text-2xl font-semibold text-brand-950 mt-1">{plan?.name ?? restaurant.pendingWelcomePlan}</h2>
              {plan && <p className="text-sm text-brand-950/60 font-light mt-1">{plan.subtitle}</p>}

              <ul className="mt-5 space-y-2.5 text-sm text-brand-950/70 font-light">
                {plan ? (
                  <>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {plan.capacity}
                    </li>
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </>
                ) : (
                  <li>Tu cuenta ya está activa con todos los beneficios de tu plan.</li>
                )}
              </ul>

              <TextureButton variant="brand" size="default" className="mt-7" onClick={goToPanel}>
                Ir al panel
              </TextureButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
