import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getToken } from '@/api/client';
import { useAuth } from '../../context/AuthContext';
import { FIXED_PLAN_PRICES, type BillingCycle, type PurchasablePlan } from '@/utils/plans';
import { PlanCards } from '@/components/landing/PlanCards';
import { PaymentForm, type SelectedPlan } from '@/components/landing/PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

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
      cycleParam === 'QUARTERLY' || cycleParam === 'SEMIANNUAL' ? cycleParam : 'MONTHLY';
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

interface Quote {
  monthlyUsd: string;
  additionalCharges: { id: string; description: string; amountUsd: string }[];
  totalUsd: string;
}

/**
 * Desglose de lo que se va a cobrar. Solo aparece cuando hay algo que explicar
 * (cargos adicionales o un precio acordado distinto al de lista): si el
 * restaurante paga la tarifa normal y nada más, este bloque sería ruido.
 *
 * Los cargos adicionales se muestran etiquetados uno por uno — el restaurante
 * tiene que poder ver por qué este mes paga más que de costumbre.
 */
function ChargeBreakdown({ plan, billingCycle }: { plan: ChoosablePlan; billingCycle: BillingCycle }) {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    setQuote(null);
    api
      .get('/plan-requests/quote', { params: { plan, billingCycle } })
      .then((res) => setQuote(res.data.data))
      .catch(() => setQuote(null));
  }, [plan, billingCycle]);

  if (!quote) return null;

  const listPrice = FIXED_PLAN_PRICES[plan][billingCycle];
  const hasCharges = quote.additionalCharges.length > 0;
  const hasAgreedPrice = Math.abs(Number(quote.monthlyUsd) - listPrice) > 0.009;
  if (!hasCharges && !hasAgreedPrice) return null;

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <p className="font-semibold text-brand-950 mb-3">Detalle de tu pago</p>

      <div className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="text-brand-950/70">
          Mensualidad
          {hasAgreedPrice && <span className="text-brand-950/40 font-light"> · precio acordado contigo</span>}
        </span>
        <span className="font-medium text-brand-950">${Number(quote.monthlyUsd).toFixed(2)}</span>
      </div>

      {quote.additionalCharges.map((c) => (
        <div key={c.id} className="border-t border-brand-950/[0.06] py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-brand-950/70 min-w-0">{c.description}</span>
            <span className="font-medium text-brand-950 shrink-0">${Number(c.amountUsd).toFixed(2)}</span>
          </div>
          <p className="text-xs font-light text-amber-700 mt-0.5">
            Cobro adicional por "{c.description}" — no forma parte de tu mensualidad, se cobra una sola vez.
          </p>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 border-t border-brand-950/10 pt-3 mt-1">
        <span className="font-semibold text-brand-950">Total a pagar</span>
        <span className="text-lg font-semibold text-brand-950">${Number(quote.totalUsd).toFixed(2)}</span>
      </div>
    </div>
  );
}
