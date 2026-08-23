import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getToken } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { FIXED_PLAN_PRICES, type BillingCycle } from '@/utils/plans';
import { SinglePlanCard, type SinglePlan } from '@/components/landing/SinglePlanCard';
import { ChargeBreakdown } from '@/components/landing/ChargeBreakdown';
import { PaymentForm, type SelectedPlan } from '@/components/landing/PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

export interface VerticalPlanOption {
  plan: SinglePlan;
  defaultName: string;
  defaultSubtitle: string;
  defaultFeatures: string[];
}

interface Props {
  plan: SinglePlan;
  defaultName: string;
  defaultSubtitle: string;
  defaultFeatures: string[];
  /** Planes adicionales del mismo vertical (ej. Elite Shop junto a Shop): una tarjeta por cada uno. */
  extraPlans?: VerticalPlanOption[];
  /** Bajo el título "Activar plan", mientras dura la prueba gratis. */
  trialingMessage: string;
  restaurant: AuthRestaurant;
  /** Vuelta al panel — cada vertical resuelve esto a su manera, ninguna navega por URL
   * (ShopLayout/ClubLayout mantienen la pantalla activa como estado local). */
  onDone: () => void;
}

/**
 * Activar/renovar el único plan de un vertical de un solo nivel (Locales Comerciales o
 * Canchas), ya autenticado — mismo flujo que BillingPage (Restaurante), pero con la tarjeta
 * de un solo plan (ver SinglePlanCard) en vez de las 3 de PlanCards. El precio y su conversión
 * a Bs (tasa BCV del día) salen de SinglePlanCard, que a su vez los trae de /public/plans →
 * DEFAULT_PLAN_CONTENT, editable desde el Dashboard maestro → Planes.
 */
export function VerticalBillingPage({ plan, defaultName, defaultSubtitle, defaultFeatures, extraPlans = [], trialingMessage, restaurant, onDone }: Props) {
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
  // createRamblayCheckout): refresca el negocio para traer el plan recién activado (si el
  // webhook ya llegó). Sin ruta propia a la que volver (estos paneles no navegan por URL), así
  // que solo limpia los parámetros de la URL para no repetir el refresh si se recarga.
  useEffect(() => {
    if (searchParams.get('ramblay') !== 'success') return;
    refresh().then(() => window.history.replaceState({}, '', window.location.pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options: VerticalPlanOption[] = [{ plan, defaultName, defaultSubtitle, defaultFeatures }, ...extraPlans];

  function choosePlan(cycle: BillingCycle = billingCycle, which: SinglePlan = plan) {
    setSelected({ plan: which, billingCycle: cycle, priceUsd: FIXED_PLAN_PRICES[which][cycle] });
    requestAnimationFrame(() => {
      document.getElementById('billing-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Entrada desde "Elegir plan" de la landing seguido de registro (?plan=X&cycle=Y):
  // pre-selecciona el ciclo y muestra el formulario de pago directamente.
  useEffect(() => {
    const planParam = searchParams.get('plan');
    const match = options.find((o) => o.plan === planParam);
    if (!match) return;
    const cycleParam = searchParams.get('cycle');
    const cycle: BillingCycle =
      cycleParam === 'QUARTERLY' || cycleParam === 'SEMIANNUAL' || cycleParam === 'ANNUAL' ? cycleParam : 'MONTHLY';
    setBillingCycle(cycle);
    choosePlan(cycle, match.plan);
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
            ? trialingMessage
            : 'Paga tu mensualidad y escribe el número de referencia. Activaremos tu cuenta en cuanto lo confirmemos.'}
        </p>
      </div>

      <div className={options.length > 1 ? 'grid gap-5 lg:grid-cols-2 lg:items-start' : ''}>
        {options.map((o) => (
          <SinglePlanCard
            key={o.plan}
            plan={o.plan}
            defaultName={o.defaultName}
            defaultSubtitle={o.defaultSubtitle}
            defaultFeatures={o.defaultFeatures}
            rateBs={rateBs}
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            onChoosePlan={() => choosePlan(billingCycle, o.plan)}
          />
        ))}
      </div>

      {selected && (
        <div id="billing-payment" className="scroll-mt-24 space-y-4">
          <ChargeBreakdown plan={selected.plan as SinglePlan} billingCycle={selected.billingCycle} />
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
