import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import type { BillingCycle, PlanId } from '@/utils/plans';
import { PlanCards } from './PlanCards';
import { ShopPlanCard } from './ShopPlanCard';

export function PricingSection() {
  const navigate = useNavigate();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [vertical, setVertical] = useState<'restaurant' | 'shop'>('restaurant');
  const isShop = vertical === 'shop';

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
        <p className="text-brand-950/60 mt-2 font-light">
          {isShop ? 'Un solo plan con todos los beneficios de QuickTap Shop.' : 'Elige el plan que se ajuste al tamaño de tu restaurante.'}
        </p>
        <p className="text-brand-950/50 text-sm mt-1 font-light">
          Primero creas tu cuenta gratis, luego completas el pago desde tu panel.
        </p>
        {rateBs && <p className="text-xs text-brand-950/40 mt-1">Precio en Bs referencial según tasa BCV del día.</p>}

        <div className="inline-flex items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mt-6">
          <button
            type="button"
            onClick={() => setVertical('restaurant')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              !isShop ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
            }`}
          >
            Restaurantes
          </button>
          <button
            type="button"
            onClick={() => setVertical('shop')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              isShop ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
            }`}
          >
            Locales Comerciales
          </button>
        </div>
      </div>

      {isShop ? (
        <ShopPlanCard rateBs={rateBs} />
      ) : (
        <PlanCards rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={choosePlan} />
      )}
    </div>
  );
}
