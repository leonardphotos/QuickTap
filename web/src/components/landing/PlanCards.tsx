import { useState } from 'react';
import type { BillingCycle, PurchasablePlan } from '@/utils/plans';
import { COMMERCIAL_PLANS } from '@/utils/commercial-plans';
import { PLAN_CONTENT } from './PlanCards.shared';
import { AdvisorLeadDialog } from './AdvisorLeadDialog';

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  onChoosePlan: (plan: PurchasablePlan) => void;
}
export function PlanCards({ onChoosePlan, onBillingCycleChange }: Props) {
  const [advisor, setAdvisor] = useState(false);
  return <div>
    <div className="grid gap-5 md:grid-cols-3">
      {PLAN_CONTENT.map(plan => {
        const offer = COMMERCIAL_PLANS[plan.id as keyof typeof COMMERCIAL_PLANS];
        return <article key={plan.id} className="flex flex-col rounded-3xl border border-blue-100 bg-white p-6 text-brand-950 shadow-sm">
          <h3 className="text-xl font-bold">{offer.name}</h3>
          <p className="mt-2 text-gray-900 text-base">{offer.outcome}</p>
          <p className="mt-5 text-3xl font-bold">€{offer.monthly.toFixed(2).replace('.', ',')}<span className="text-sm font-normal"> / mes</span></p>
          <p className="mt-3 font-medium text-base">{plan.capacity}</p>
          <ul className="my-5 flex-1 space-y-2 text-sm text-slate-600">{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
          <button className="rounded-xl bg-brand-500 px-4 py-3 font-semibold text-white" onClick={() => { onBillingCycleChange('MONTHLY'); onChoosePlan(plan.id); }}>
            {plan.id === 'ESSENTIAL' ? 'Configúralo con QuickStar' : plan.id === 'OPERATIONS' ? 'Elegir con implementación acompañada' : 'Elegir Control · una sede'}
          </button>
          <button className="mt-3 text-sm text-brand-600 underline" onClick={() => setAdvisor(true)}>
            {plan.id === 'ESSENTIAL' ? 'Prefiero implementación asistida' : 'Solicitar demo / cotización'}
          </button>
        </article>;
      })}
    </div>
    <p className="mt-5 text-center text-gray-900 text-base">15 días de prueba con Control. Pedidos sin límite. Control con varias sedes, inventario complejo, configuración especial o capacitación presencial requiere cotización. Más de 2 sedes: solicitar cotización.</p>
    {advisor && <AdvisorLeadDialog onClose={() => setAdvisor(false)} />}
  </div>;
}
