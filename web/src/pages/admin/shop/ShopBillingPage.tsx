import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getToken } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { FIXED_PLAN_PRICES, type BillingCycle } from '@/utils/plans';
import { ShopPlanCard } from '@/components/landing/ShopPlanCard';
import { ChargeBreakdown } from '@/components/landing/ChargeBreakdown';
import { PaymentForm, type SelectedPlan } from '@/components/landing/PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Activar/renovar el único plan de Locales Comerciales (QuickTap Shop), ya autenticado — mismo
 * flujo que BillingPage (Restaurante), pero con la tarjeta de un solo plan (ver ShopPlanCard) en
 * vez de las 3 de PlanCards. El precio y su conversión a Bs (tasa BCV del día) salen de
 * ShopPlanCard, que a su vez los trae de /public/plans → DEFAULT_PLAN_CONTENT.SHOP, editable
 * desde el Dashboard maestro → Planes.
 */
export default function ShopBillingPage({ restaurant, onDone }: { restaurant: AuthRestaurant; onDone: () => void }) {
  const { user, refresh } = useAuth();
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
  // createRamblayCheckout): refresca el local para traer el plan recién activado (si el
  // webhook ya llegó). Sin ruta propia a la que volver (ShopLayout no navega por URL), así
  // que solo limpia los parámetros de la URL para no repetir el refresh si se recarga.
  useEffect(() => {
    if (searchParams.get('ramblay') !== 'success') return;
    refresh().then(() => window.history.replaceState({}, '', window.location.pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choosePlan(cycle: BillingCycle = billingCycle) {
    setSelected({ plan: 'SHOP', billingCycle: cycle, priceUsd: FIXED_PLAN_PRICES.SHOP[cycle] });
    requestAnimationFrame(() => {
      document.getElementById('billing-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=SHOP&cycle=Y):
  // pre-selecciona el ciclo y muestra el formulario de pago directamente.
  useEffect(() => {
    if (searchParams.get('plan') !== 'SHOP') return;
    const cycleParam = searchParams.get('cycle');
    const cycle: BillingCycle =
      cycleParam === 'QUARTERLY' || cycleParam === 'SEMIANNUAL' ? cycleParam : 'MONTHLY';
    setBillingCycle(cycle);
    choosePlan(cycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">
          {restaurant.subscriptionStatus === 'TRIALING' ? 'Activar plan' : 'Renovar suscripción'}
        </h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          {restaurant.subscriptionStatus === 'TRIALING'
            ? 'Activa QuickTap Shop para seguir usándolo cuando termine la prueba.'
            : 'Paga tu mensualidad y escribe el número de referencia. Activaremos tu cuenta en cuanto lo confirmemos.'}
        </p>
      </div>

      <ShopPlanCard rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={() => choosePlan()} />

      {selected && (
        <div id="billing-payment" className="scroll-mt-24 space-y-4">
          <ChargeBreakdown plan="SHOP" billingCycle={selected.billingCycle} />
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
                    onDone();
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
