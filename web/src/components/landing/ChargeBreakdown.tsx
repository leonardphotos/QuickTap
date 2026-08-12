import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { FIXED_PLAN_PRICES, type BillingCycle, type PurchasablePlan } from '@/utils/plans';

interface Quote {
  monthlyUsd: string;
  additionalCharges: { id: string; description: string; amountUsd: string }[];
  totalUsd: string;
}

/**
 * Desglose de lo que se va a cobrar. Solo aparece cuando hay algo que explicar
 * (cargos adicionales o un precio acordado distinto al de lista): si el
 * restaurante/local paga la tarifa normal y nada más, este bloque sería ruido.
 *
 * Compartido entre BillingPage (Restaurante) y ShopBillingPage (Locales
 * Comerciales) — la mecánica de cargos adicionales/precio acordado es la misma
 * para cualquier plan comprable (ver PurchasablePlan en utils/plans.ts).
 *
 * Los cargos adicionales se muestran etiquetados uno por uno — quien paga
 * tiene que poder ver por qué este mes paga más que de costumbre.
 */
export function ChargeBreakdown({ plan, billingCycle }: { plan: PurchasablePlan; billingCycle: BillingCycle }) {
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
