import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getToken } from '@/api/client';
import { useAuth } from '../../context/AuthContext';
import { calculateCustomPriceUsd, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
import { PlanCards, type CustomPlanValues } from '@/components/landing/PlanCards';
import { PaymentForm, type SelectedPlan } from '@/components/landing/PaymentForm';
import { TextureButton } from '@/components/ui/texture-button';

/** Activar el plan (fin de la prueba) o pagar la mensualidad, ya autenticado. */
export default function BillingPage() {
  const { user, restaurant, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [custom, setCustom] = useState<CustomPlanValues>({
    tables: 10,
    users: 3,
    orders: 200,
    administration: false,
    inventoryBasic: false,
    inventoryRecipe: false,
    accountsPayable: false,
  });
  const [selected, setSelected] = useState<SelectedPlan | null>(null);

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  const customPriceUsd = useMemo(
    () => calculateCustomPriceUsd(custom.tables, custom.users, custom.orders, custom),
    [custom],
  );

  function choosePlan(plan: Exclude<PlanId, 'TRIAL'>, addons: CustomPlanValues = custom) {
    if (plan === 'CUSTOM') {
      setSelected({
        plan,
        billingCycle: 'MONTHLY',
        priceUsd: calculateCustomPriceUsd(addons.tables, addons.users, addons.orders, addons),
        customTables: addons.tables,
        customUsers: addons.users,
        customOrders: addons.orders,
        customAddons: {
          administration: addons.administration,
          inventoryBasic: addons.inventoryBasic,
          inventoryRecipe: addons.inventoryRecipe,
          accountsPayable: addons.accountsPayable,
        },
      });
    } else {
      setSelected({ plan, billingCycle, priceUsd: FIXED_PLAN_PRICES[plan][billingCycle] });
    }
    requestAnimationFrame(() => {
      document.getElementById('billing-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Entrada desde "Añadir a mi plan" del Dashboard (?custom=1), o desde
  // "Elegir plan" de la landing seguido de registro (?plan=X&cycle=Y, y para
  // el plan Personalizado también &tables=&users=&orders=): pre-selecciona
  // el plan y muestra el formulario de pago directamente.
  useEffect(() => {
    if (searchParams.get('custom') === '1') {
      choosePlan('CUSTOM');
      return;
    }

    const planParam = searchParams.get('plan');
    const validPlans: Exclude<PlanId, 'TRIAL'>[] = ['DELIVERY', 'STARTER', 'PRO', 'PREMIUM', 'CUSTOM'];
    if (!planParam || !validPlans.includes(planParam as any)) return;
    const plan = planParam as Exclude<PlanId, 'TRIAL'>;
    const cycleParam = searchParams.get('cycle');
    const cycle: BillingCycle =
      cycleParam === 'QUARTERLY' || cycleParam === 'SEMIANNUAL' ? cycleParam : 'MONTHLY';
    setBillingCycle(cycle);

    if (plan === 'CUSTOM') {
      const tables = Number(searchParams.get('tables')) || custom.tables;
      const users = Number(searchParams.get('users')) || custom.users;
      const orders = Number(searchParams.get('orders')) || custom.orders;
      const addons: CustomPlanValues = {
        tables,
        users,
        orders,
        administration: searchParams.get('addonAdministration') === '1',
        inventoryBasic: searchParams.get('addonInventoryBasic') === '1',
        inventoryRecipe: searchParams.get('addonInventoryRecipe') === '1',
        accountsPayable: searchParams.get('addonAccountsPayable') === '1',
      };
      setCustom(addons);
      choosePlan('CUSTOM', addons);
      return;
    } else {
      setSelected({ plan, billingCycle: cycle, priceUsd: FIXED_PLAN_PRICES[plan][cycle] });
    }
    requestAnimationFrame(() => {
      document.getElementById('billing-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
        <div id="billing-payment" className="scroll-mt-24">
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
                <p className="text-lg font-semibold text-brand-950">¡Solicitud enviada!</p>
                <p className="text-sm text-brand-950/60 font-light mt-1">{message}</p>
                <TextureButton
                  variant="brand"
                  size="default"
                  className="mt-5 !w-auto px-6"
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
