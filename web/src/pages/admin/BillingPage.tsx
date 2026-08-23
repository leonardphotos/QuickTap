import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getToken } from '@/api/client';
import { useAuth } from '../../context/AuthContext';
import { FIXED_PLAN_PRICES, type BillingCycle, type PurchasablePlan } from '@/utils/plans';
import { PlanCards } from '@/components/landing/PlanCards';
import { ChargeBreakdown } from '@/components/landing/ChargeBreakdown';
import { PaymentForm, type SelectedPlan } from '@/components/landing/PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

// Los 3 planes de Restaurante — Locales Comerciales tiene su propio flujo de facturación,
// ver web/src/pages/admin/shop/ShopBillingPage.tsx (AdminLayout desvía businessType SHOP
// a ShopLayout antes de llegar acá, así que esta página nunca la ve un local).
type ChoosablePlan = PurchasablePlan;
const VALID_PLANS: ChoosablePlan[] = ['DELIVERY', 'PRO', 'ELITE'];

/** Activar el plan (fin de la prueba) o pagar la mensualidad, ya autenticado. */
export default function BillingPage() {
  const { user, restaurant, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [selected, setSelected] = useState<SelectedPlan | null>(null);

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  // Vuelta desde el checkout hospedado de Ramblay (ver plan-request.service.ts,
  // createRamblayCheckout): refresca el restaurante para traer el plan recién
  // activado (si el webhook ya llegó) y vuelve al panel — si `pendingWelcomePlan`
  // quedó seteado, AdminLayout redirige solo a la bienvenida.
  useEffect(() => {
    if (searchParams.get('ramblay') !== 'success') return;
    refresh().then(() => navigate('/admin', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choosePlan(plan: ChoosablePlan, cycle: BillingCycle = billingCycle) {
    setSelected({ plan, billingCycle: cycle, priceUsd: FIXED_PLAN_PRICES[plan][cycle] });
    requestAnimationFrame(() => {
      document.getElementById('billing-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=X&cycle=Y):
  // pre-selecciona el plan y muestra el formulario de pago directamente.
  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (!planParam || !VALID_PLANS.includes(planParam as ChoosablePlan)) return;
    const plan = planParam as ChoosablePlan;
    const cycleParam = searchParams.get('cycle');
    const cycle: BillingCycle =
      cycleParam === 'QUARTERLY' || cycleParam === 'SEMIANNUAL' || cycleParam === 'ANNUAL' ? cycleParam : 'MONTHLY';
    setBillingCycle(cycle);
    choosePlan(plan, cycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!restaurant) return null;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">
          {restaurant.subscriptionStatus === 'TRIALING' ? 'Activar plan' : 'Renovar suscripción'}
        </h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          {restaurant.subscriptionStatus === 'TRIALING'
            ? 'Elige el plan que se ajuste a tu restaurante para seguir usando QuickTap cuando termine la prueba.'
            : 'Elige tu plan, paga y escribe el número de referencia. Activaremos tu cuenta en cuanto lo confirmemos.'}
        </p>
      </div>

      <PlanCards rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={choosePlan} />

      {selected && (
        <div id="billing-payment" className="scroll-mt-24 space-y-4">
          <ChargeBreakdown plan={selected.plan as ChoosablePlan} billingCycle={selected.billingCycle} />
          <PaymentForm
            selected={selected}
            rateBs={rateBs}
            onCancel={() => setSelected(null)}
            submitUrl="/plan-requests"
            authToken={getToken() ?? undefined}
            prefillName={user?.name}
            prefillEmail={user?.email}
            renderSuccess={(message) => (
              <div className="rounded-2xl border border-brand-950/10 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-semibold text-brand-950">Pago en verificación</p>
                <p className="text-sm text-brand-950/60 font-light mt-1">{message}</p>
                <TextureButton
                  variant="brand"
                  size="default"
                  className="mt-5 !w-auto"
                  onClick={() => {
                    refresh();
                    navigate('/admin');
                  }}
                >
                  Volver al panel
                </TextureButton>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
