import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/api/client';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, CYCLE_MONTHS, FIXED_PLAN_PRICES, type BillingCycle, type PurchasablePlan } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';
import { AdvisorLeadDialog } from './AdvisorLeadDialog';

export interface PlanContent {
  id: PurchasablePlan;
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  tier?: 'popular' | 'premium';
}

/** Incluido en los 3 planes por igual — ver DEFAULT_PLAN_CONTENT en platform-settings.service.ts. */
const CHATBOT_FEATURES = [
  'Chatbot de WhatsApp vinculado a tu propio número, sin apps externas ni comisiones',
  'Responde solo con el menú apenas alguien te escribe por primera vez',
  'Manda los datos de pago y el monto exacto a cancelar apenas se crea el pedido',
  'Recibe la foto del comprobante, la verifica contigo y manda el pedido a cocina solo al aprobarla',
];

export const PLAN_CONTENT: PlanContent[] = [
  {
    id: 'DELIVERY',
    name: 'Solo Delivery',
    subtitle: 'Cocinas fantasma o solo pedidos por WhatsApp',
    capacity: 'Sucursales ilimitadas — sin mesas ni códigos QR',
    features: [
      'Productos, Cocinas y Sección de Delivery en cada sucursal',
      'Pedidos ilimitados',
      'Hasta 6 usuarios de tu equipo',
      ...CHATBOT_FEATURES,
    ],
  },
  {
    id: 'PRO',
    name: 'Plan Pro',
    subtitle: 'Todos los beneficios de QuickTap',
    capacity: 'Mesas, pedidos y sucursales ilimitadas',
    features: [
      'Usuarios ilimitados',
      'Administración, propinas y reportes de ventas',
      'Margen de utilidad por producto',
      'Inventario por receta',
      'Gastos y cuentas por pagar',
      ...CHATBOT_FEATURES,
    ],
    tier: 'popular',
  },
  {
    id: 'ELITE',
    name: 'Plan Elite',
    subtitle: 'Todo lo del Plan Pro + beneficios exclusivos, sin límite de sucursales',
    capacity: 'Sucursales ilimitadas, cada una con mesas y pedidos ilimitados',
    features: [
      'Todo el Plan Pro en cada sucursal',
      'Catálogo, inventario y equipo por sucursal',
      'Reporte consolidado de ventas entre sucursales',
      'Productos más vendidos por sucursal',
      'Soporte prioritario 24/7 por WhatsApp',
      'Gerente de cuenta dedicado',
      'Onboarding y migración de catálogo sin costo',
      'Acceso anticipado a nuevas funcionalidades',
      ...CHATBOT_FEATURES,
    ],
    tier: 'premium',
  },
];

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  onChoosePlan: (plan: PurchasablePlan) => void;
}

interface FetchedPlan {
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  prices: Record<BillingCycle, number>;
}

/** % de descuento del ciclo frente al mensual, tomando el Plan Pro como referencia
 * para el badge del propio toggle (igual para los tres planes, ya que todos aplican
 * el mismo % de descuento por ciclo). */
function cycleOffPercent(cycle: BillingCycle): number {
  if (cycle === 'MONTHLY') return 0;
  const base = FIXED_PLAN_PRICES.PRO.MONTHLY;
  return Math.round((1 - FIXED_PLAN_PRICES.PRO[cycle] / base) * 100);
}

export function PlanCards({ rateBs, billingCycle, onBillingCycleChange, onChoosePlan }: Props) {
  // Precios/descripción editables desde el Dashboard maestro; hasta que carguen,
  // se muestran los valores por defecto (PLAN_CONTENT/FIXED_PLAN_PRICES).
  const [dynamicContent, setDynamicContent] = useState<Record<string, FetchedPlan> | null>(null);
  // Moneda en la que QuickTap cobra la mensualidad (Dashboard maestro → Planes → Moneda de
  // cobro) — se pide aparte de `rateBs` (que el padre siempre trae en USD, porque también
  // alimenta al plan de Shop, que no es parte de esta moneda) para poder mostrar el Bs
  // correcto aunque el padre solo tenga la tasa de USD.
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [ownRateBs, setOwnRateBs] = useState<string | null>(null);
  // Plan Elite: en vez de mandar a registrarse, abre el formulario de contacto.
  const [pidiendoAsesor, setPidiendoAsesor] = useState(false);

  useEffect(() => {
    api
      .get('/public/plans')
      .then((res) => setDynamicContent(res.data.data ?? null))
      .catch(() => {});
    api
      .get('/public/plans/currency')
      .then(async (res) => {
        const currency = res.data.data?.currency as 'USD' | 'EUR' | undefined;
        if (!currency) return;
        setCurrencySymbol(currency === 'EUR' ? '€' : '$');
        if (currency === 'EUR') {
          const rateRes = await api.get('/public/exchange-rate');
          setOwnRateBs(rateRes.data.data?.EUR?.rateBs ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const effectiveRateBs = currencySymbol === '€' ? ownRateBs : rateBs;

  return (
    <div>
      <div className="flex items-center justify-center gap-1 mb-8">
        <div className="inline-flex gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.05] p-1.5">
          {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const).map((c) => {
            const active = billingCycle === c;
            const off = cycleOffPercent(c);
            return (
              <button
                key={c}
                onClick={() => onBillingCycleChange(c)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-out-strong active:scale-[0.96] ${
                  active
                    ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                    : 'text-brand-950/60 hover:text-brand-950'
                }`}
              >
                {BILLING_CYCLE_LABEL[c]}
                {off > 0 && (
                  <span
                    className={`text-[10.5px] font-bold rounded-full px-1.5 py-0.5 ${
                      active ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    -{off}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto items-stretch">
        {PLAN_CONTENT.map((plan) => {
          const d = dynamicContent?.[plan.id];
          const name = d?.name ?? plan.name;
          const subtitle = d?.subtitle ?? plan.subtitle;
          const capacity = d?.capacity ?? plan.capacity;
          const features = d?.features ?? plan.features;
          const price = d?.prices[billingCycle] ?? FIXED_PLAN_PRICES[plan.id][billingCycle];
          const monthlyPrice = d?.prices.MONTHLY ?? FIXED_PLAN_PRICES[plan.id].MONTHLY;
          const months = CYCLE_MONTHS[billingCycle];
          // El precio mostrado es la mensualidad equivalente; el cobro es el ciclo completo.
          const cycleTotal = Math.round(price * months * 100) / 100;
          const totalSavings = Math.max(0, (monthlyPrice - price) * months);
          const showSavings = billingCycle !== 'MONTHLY' && totalSavings > 0.01;
          const isPopular = plan.tier === 'popular';
          const isPremium = plan.tier === 'premium';

          return (
            <div key={plan.id} className={`relative ${isPopular ? 'sm:-translate-y-1.5' : ''}`}>
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-[0_4px_12px_-2px_rgba(5,108,242,0.5)]">
                  Más popular
                </span>
              )}
              {isPremium && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-[#B8902E] text-white text-xs font-bold px-3 py-1 rounded-full shadow-[0_4px_12px_-2px_rgba(184,144,46,0.5)]">
                  ✨ Premium
                </span>
              )}
              <div
                className={`h-full flex flex-col rounded-2xl border bg-white p-6 ${
                  isPopular
                    ? 'border-brand-400/50 shadow-[0_20px_48px_-20px_rgba(5,108,242,0.4)]'
                    : isPremium
                      ? 'border-2 border-[#B8902E]/70 shadow-[0_16px_40px_-20px_rgba(184,144,46,0.4)]'
                      : 'border-brand-950/10 shadow-sm'
                }`}
              >
                <p className="font-semibold text-brand-950">{name}</p>
                <p className="text-xs text-brand-950/50 font-light mt-0.5 min-h-[2.2em]">{subtitle}</p>

                <div className="mt-4 flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-3xl font-bold text-brand-950 tracking-tight">{currencySymbol}{price.toFixed(2)}</span>
                    <span className="text-xs text-brand-950/40 font-medium">/mes</span>
                    {billingCycle !== 'MONTHLY' && (
                      <span className="text-sm text-brand-950/35 line-through">{currencySymbol}{monthlyPrice.toFixed(2)}</span>
                    )}
                  </div>
                  {effectiveRateBs && (
                    <p className="text-[11px] text-brand-950/45">{formatBs(price, effectiveRateBs)}/mes · a tasa BCV</p>
                  )}
                  {billingCycle !== 'MONTHLY' && (
                    <p className="text-[11px] text-brand-950/55 font-medium">
                      Un solo pago de {currencySymbol}{cycleTotal.toFixed(2)}
                    </p>
                  )}
                  <span
                    className={`self-start mt-2 inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 transition-opacity duration-200 ${
                      showSavings ? 'opacity-100 bg-emerald-50 text-emerald-700' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    ◆ Ahorras {currencySymbol}{totalSavings.toFixed(0)} {billingCycle === 'ANNUAL' ? 'al año' : 'en el ciclo'}
                  </span>
                </div>

                <ul className="mt-4 space-y-2 text-sm text-brand-950/70 flex-1 font-light pt-4 border-t border-brand-950/[0.06]">
                  <li className="flex items-start gap-2 font-semibold text-brand-950">
                    <Check
                      className={`h-4 w-4 shrink-0 mt-0.5 ${isPopular ? 'text-brand-500' : isPremium ? 'text-[#B8902E]' : 'text-brand-950/40'}`}
                    />
                    {capacity}
                  </li>
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className={`h-4 w-4 shrink-0 mt-0.5 ${isPopular ? 'text-brand-500' : isPremium ? 'text-[#B8902E]' : 'text-brand-950/40'}`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* El Elite no se contrata solo: sucursales ilimitadas, migración de catálogo
                    y gerente de cuenta se acuerdan hablando, no eligiendo un plan y pagando. */}
                {plan.id === 'ELITE' ? (
                  <TextureButton variant="primary" size="default" className="mt-6" onClick={() => setPidiendoAsesor(true)}>
                    Contactar a un asesor
                  </TextureButton>
                ) : (
                  <TextureButton
                    variant={isPopular ? 'brand' : 'primary'}
                    size="default"
                    className="mt-6"
                    onClick={() => onChoosePlan(plan.id)}
                  >
                    Elegir plan
                  </TextureButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pidiendoAsesor && <AdvisorLeadDialog onClose={() => setPidiendoAsesor(false)} />}
    </div>
  );
}
