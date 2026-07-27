import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import type { BillingCycle, PlanId } from '@/utils/plans';
import { PlanCards } from './PlanCards';

export function PricingSection() {
  const navigate = useNavigate();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  // El pago solo se hace ya con la cuenta creada (ver BillingPage): aquí solo
  // se elige el plan y se manda a registrar, llevando la elección en la URL
  // para que el panel la retome automáticamente después de crear la cuenta.
  function choosePlan(plan: Exclude<PlanId, 'TRIAL' | 'STARTER' | 'PREMIUM' | 'CUSTOM'>) {
    const params = new URLSearchParams({ plan, cycle: billingCycle });
    navigate(`/empezar?${params.toString()}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-20 w-full">
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-brand-950">Precios y planes</h2>
        <p className="text-brand-950/60 mt-2 font-light">Elige el plan que se ajuste al tamaño de tu restaurante.</p>
        <p className="text-brand-950/50 text-sm mt-1 font-light">
          Primero creas tu cuenta gratis, luego completas el pago desde tu panel.
        </p>
        {rateBs && <p className="text-xs text-brand-950/40 mt-1">Precio en Bs referencial según tasa BCV del día.</p>}
      </div>

      <PlanCards rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={choosePlan} />
    </div>
  );
}
