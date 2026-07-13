import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { calculateCustomPriceUsd, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
import { PlanCards, type CustomPlanValues } from './PlanCards';
import { PaymentForm, type SelectedPlan } from './PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

export function PricingSection() {
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [custom, setCustom] = useState<CustomPlanValues>({ tables: 10, users: 3, orders: 200 });
  const [selected, setSelected] = useState<SelectedPlan | null>(null);

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  const customPriceUsd = useMemo(
    () => calculateCustomPriceUsd(custom.tables, custom.users, custom.orders),
    [custom],
  );

  function choosePlan(plan: Exclude<PlanId, 'TRIAL'>) {
    if (plan === 'CUSTOM') {
      setSelected({
        plan,
        billingCycle: 'MONTHLY',
        priceUsd: customPriceUsd,
        customTables: custom.tables,
        customUsers: custom.users,
        customOrders: custom.orders,
      });
    } else {
      setSelected({ plan, billingCycle, priceUsd: FIXED_PLAN_PRICES[plan][billingCycle] });
    }
    requestAnimationFrame(() => {
      document.getElementById('plan-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-20 w-full">
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-brand-950">Precios y planes</h2>
        <p className="text-brand-950/60 mt-2 font-light">Elige el plan que se ajuste al tamaño de tu restaurante.</p>
        {rateBs && <p className="text-xs text-brand-950/40 mt-1">Precio en Bs referencial según tasa BCV del día.</p>}
      </div>

      <PlanCards
        rateBs={rateBs}
        billingCycle={billingCycle}
        onBillingCycleChange={setBillingCycle}
        custom={custom}
        onCustomChange={setCustom}
        customPriceUsd={customPriceUsd}
        onChoosePlan={choosePlan}
      />

      {selected && (
        <div id="plan-payment" className="scroll-mt-24 mt-10">
          <PaymentForm
            selected={selected}
            rateBs={rateBs}
            onCancel={() => setSelected(null)}
            submitUrl="/public/plan-requests"
            renderSuccess={(message) => (
              <div className="rounded-2xl border border-brand-950/10 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-semibold text-brand-950">¡Solicitud enviada!</p>
                <p className="text-sm text-brand-950/60 font-light mt-1">
                  {message} Ya puedes registrarte para ir dejando lista la configuración de tu restaurante.
                </p>
                <Link to="/admin/register" className="mt-5 inline-block">
                  <TextureButton variant="brand" size="default">
                    Regístrate ahora
                  </TextureButton>
                </Link>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
