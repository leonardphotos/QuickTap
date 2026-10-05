import { SignupPromotionBanner, signupDiscountedMonths } from '@/components/billing/SignupPromotionBanner';
import { billingReturn } from '@/utils/billing-return';
import { readAddons } from "@/utils/membership-addons";
import { MembershipAddons } from '@/components/billing/MembershipAddons';
import './billing-membership.css';
import { api,getToken } from '@/api/client';
import { MembershipCapacity } from '@/components/admin/MembershipCapacity';
import { ChargeBreakdown } from '@/components/landing/ChargeBreakdown';
import { PaymentForm,type SelectedPlan } from '@/components/landing/PaymentForm';
import { PlanCards } from '@/components/landing/PlanCards';
import { TextureButton } from '@/components/ui/texture-button';
import { FIXED_PLAN_PRICES,type BillingCycle,type PurchasablePlan } from '@/utils/plans';
import { useEffect,useState } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.shared';

// Los 3 planes de Restaurante — Locales Comerciales tiene su propio flujo de facturación,
// ver web/src/pages/admin/shop/ShopBillingPage.tsx (AdminLayout desvía businessType SHOP
// a ShopLayout antes de llegar acá, así que esta página nunca la ve un local).
type ChoosablePlan = PurchasablePlan;
const VALID_PLANS: ChoosablePlan[] = ['ESSENTIAL', 'OPERATIONS', 'CONTROL'];

/** Activar el plan (fin de la prueba) o pagar la mensualidad, ya autenticado. */
export default function BillingPage() {
  const { user, restaurant, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [selected, setSelected] = useState<SelectedPlan | null>(null);
  const [pendingProof, setPendingProof] = useState(false);
  useEffect(() => {
    api.get('/plan-requests/pending').then(({ data }) => {
      const pending = data.data;
      if (!pending) return;
      if (pending.paymentReference === 'Pago fraccionado') {
        setSelected({ plan: pending.plan, billingCycle: pending.billingCycle, priceUsd: Number(pending.priceUsd), addonsOnly:!!pending.membershipTerms?.addonUpgrade, membershipAddons:readAddons(pending.membershipTerms) });
      } else if (pending.proofImageUrl) setPendingProof(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.EUR?.rateBs ?? null))
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

  useEffect(() => {
    if(searchParams.get('renew')!=='1'||!restaurant?.subscriptionPlan)return;
    const plan=restaurant.pendingDowngradePlan??restaurant.subscriptionPlan;
    if(!(plan in FIXED_PLAN_PRICES))return;
    const cycle=restaurant.billingCycle??'MONTHLY';
    setSelected({plan:plan as PurchasablePlan,billingCycle:cycle,priceUsd:FIXED_PLAN_PRICES[plan as PurchasablePlan][cycle]});
    // La solicitud pendiente, si existe, se carga por separado y conserva su importe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!restaurant) return null;
  const billingTarget=billingReturn(searchParams.toString());
  if(billingTarget.slug&&restaurant.slug!==billingTarget.slug)return <section className="mx-auto max-w-lg rounded-3xl bg-white p-6"><h1 className="text-xl font-semibold">Este aviso corresponde a otro local</h1><p className="my-4 text-gray-900 text-base">Tu sesión es de {restaurant.name}. Inicia sesión en el local del aviso para revisar y pagar su membresía.</p><button className="rounded-xl bg-brand-500 px-4 py-3 text-white" onClick={()=>{logout();navigate(billingTarget.loginPath);}}>Iniciar sesión en el local del aviso</button></section>;

  if (pendingProof) return <div className="mx-auto max-w-xl rounded-3xl border border-sky-100 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-brand-950">Tu pago fue recibido y está en verificación</h1><p className="mt-3 text-gray-900 text-base">Puedes continuar durante la hora de acceso provisional desde tu primer comprobante. Si sigue pendiente al vencer ese plazo, el equipo recibirá un recordatorio.</p><TextureButton className="mt-6" variant="brand" onClick={async () => { await refresh(); navigate('/admin'); }}>Volver al panel</TextureButton></div>;

  if(searchParams.get('renew')==='1'&&selected)return <PaymentForm key={selected.plan+selected.billingCycle} selected={selected} rateBs={rateBs} onCancel={()=>{setSelected(null);setSearchParams({})}} submitUrl="/plan-requests" authToken={getToken()??undefined} prefillName={user?.name} prefillEmail={user?.email} renderSuccess={message=><section className="qt-pay-panel" style={{maxWidth:520,margin:'32px auto'}}><h1 className="text-xl font-semibold">Comprobante recibido</h1><p className="qt-pay-intro text-base">{message}</p><button className="qt-pay-primary" onClick={async()=>{await refresh();navigate('/admin')}}>Volver al panel</button></section>}/>;

  return (
    <div className="qt-membership">
      <header className="qt-membership-heading">
        <span className="qt-membership-eyebrow">TU MEMBRESÍA</span>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">
          {restaurant.subscriptionStatus === 'TRIALING' ? 'Activar plan' : 'Renovar suscripción'}
        </h1>
        <p className="text-brand-950/60 font-light mt-1 text-base">
          {restaurant.subscriptionStatus === 'TRIALING'
            ? 'Elige el plan que se ajuste a tu restaurante para seguir usando QuickTap cuando termine la prueba.'
            : 'Elige tu plan, paga y escribe el número de referencia. Activaremos tu cuenta en cuanto lo confirmemos.'}
        </p>
      </header>

      {restaurant.subscriptionStatus !== 'TRIALING' && ['DELIVERY', 'PRO', 'ELITE'].includes(restaurant.subscriptionPlan ?? '') && <div className="qt-membership-current"><h2 className="font-semibold">Conserva tu membresía actual</h2><p className="mt-2 text-base">No cambiaremos tu tarifa, beneficios ni vencimiento. Puedes renovar tu contrato actual o elegir voluntariamente la nueva oferta.</p><button className="mt-3 rounded-xl bg-brand-500 px-4 py-2 text-white" onClick={() => choosePlan(restaurant.subscriptionPlan as ChoosablePlan, (restaurant.billingCycle ?? 'MONTHLY') as BillingCycle)}>Renovar con mis condiciones actuales</button></div>}
      {signupDiscountedMonths(restaurant.signupPromotionVersion) > 0 && (restaurant.signupPromotionMonthsUsed ?? 0) < signupDiscountedMonths(restaurant.signupPromotionVersion) && <SignupPromotionBanner totalMonths={signupDiscountedMonths(restaurant.signupPromotionVersion)} remainingMonths={signupDiscountedMonths(restaurant.signupPromotionVersion) - (restaurant.signupPromotionMonthsUsed ?? 0)} />}
      <MembershipCapacity />
      {restaurant.subscriptionStatus !== 'TRIALING' && restaurant.subscriptionPlan && ['ESSENTIAL','OPERATIONS','CONTROL','PRO','DELIVERY','ELITE'].includes(restaurant.subscriptionPlan) && <MembershipAddons cycle={restaurant.billingCycle??"MONTHLY"} plan={restaurant.subscriptionPlan} terms={restaurant.membershipTerms} onChoose={value=>{setSelected(value);setSearchParams({renew:'1'})}}/>}
      <section className="qt-membership-plans" aria-label="Planes disponibles"><PlanCards rateBs={rateBs} billingCycle={billingCycle} onBillingCycleChange={setBillingCycle} onChoosePlan={choosePlan} /></section>

      {selected && (
        <div id="billing-payment" className="scroll-mt-24 space-y-4">
          <ChargeBreakdown plan={selected.plan as ChoosablePlan} billingCycle={selected.billingCycle} />
          <PaymentForm
            key={selected.plan + selected.billingCycle}
            selected={selected}
            rateBs={rateBs}
            onCancel={() => setSelected(null)}
            submitUrl="/plan-requests"
            authToken={getToken() ?? undefined}
            prefillName={user?.name}
            prefillEmail={user?.email}
            renderSuccess={(message) => (
              <div className="rounded-2xl border border-brand-950/10 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-semibold text-brand-950">Tu pago fue recibido y está en verificación</p>
                <p className="text-brand-950/60 font-light mt-1 text-base">{message}</p>
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
