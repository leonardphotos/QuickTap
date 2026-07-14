import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

export interface PlanContent {
  id: PlanId;
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_CONTENT: PlanContent[] = [
  {
    id: 'TRIAL',
    name: 'Prueba Gratuita',
    subtitle: '15 días, sin tarjeta',
    capacity: 'Mesas y códigos QR ilimitados durante la prueba',
    features: [
      'Pedidos ilimitados',
      'Divisor de comandas (Cocina / Barra)',
      '"Llamar al mesonero" y "Pedir la cuenta"',
    ],
  },
  {
    id: 'DELIVERY',
    name: 'Solo Delivery',
    subtitle: 'Cocinas fantasma o solo pedidos por WhatsApp',
    capacity: 'Sin mesas ni códigos QR — acceso directo a Cocina',
    features: ['200 pedidos al mes', 'Hasta 3 usuarios de tu equipo'],
  },
  {
    id: 'STARTER',
    name: 'Plan Inicial',
    subtitle: 'Food trucks o cafés pequeños',
    capacity: 'Hasta 5-6 mesas',
    features: ['150 pedidos al mes', 'Hasta 4 usuarios de tu equipo'],
  },
  {
    id: 'PRO',
    name: 'Plan Pro / Restaurante',
    subtitle: 'El punto ideal para la mayoría',
    capacity: 'Hasta 20 mesas',
    features: ['400 pedidos al mes', 'Hasta 8 usuarios de tu equipo'],
    highlighted: true,
  },
  {
    id: 'PREMIUM',
    name: 'Plan Premium',
    subtitle: 'Locales de alto flujo',
    capacity: 'Mesas ilimitadas',
    features: ['Pedidos ilimitados', 'Hasta 20 usuarios de tu equipo'],
  },
];

export interface CustomPlanValues {
  tables: number;
  users: number;
  orders: number;
}

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  custom: CustomPlanValues;
  onCustomChange: (v: CustomPlanValues) => void;
  customPriceUsd: number;
  onChoosePlan: (plan: Exclude<PlanId, 'TRIAL'>) => void;
  /** La landing pública muestra la tarjeta de prueba gratis; el billing autenticado no (ya la están usando o ya pasó). */
  showTrial?: boolean;
}

export function PlanCards({
  rateBs,
  billingCycle,
  onBillingCycleChange,
  custom,
  onCustomChange,
  customPriceUsd,
  onChoosePlan,
  showTrial = true,
}: Props) {
  function priceLabel(usd: number) {
    return (
      <>
        <span className="text-3xl font-semibold text-brand-950">${usd.toFixed(2)}</span>
        <span className="text-brand-950/60">/mes</span>
        {rateBs && <p className="text-xs text-brand-950/50 mt-0.5">{formatBs(usd, rateBs)}/mes</p>}
      </>
    );
  }

  const plans = showTrial ? PLAN_CONTENT : PLAN_CONTENT.filter((p) => p.id !== 'TRIAL');

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-8">
        {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const).map((c) => (
          <button
            key={c}
            onClick={() => onBillingCycleChange(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billingCycle === c ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {BILLING_CYCLE_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map((plan) => (
          <div key={plan.id} className="relative">
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full shadow">
                Más popular
              </span>
            )}
            <div
              className={`h-full flex flex-col rounded-2xl border bg-white p-6 ${
                plan.highlighted ? 'border-brand-400/50 ring-2 ring-brand-400/30 shadow-md' : 'border-brand-950/10 shadow-sm'
              }`}
            >
              <p className="font-semibold text-brand-950">{plan.name}</p>
              <p className="text-xs text-brand-950/50 font-light mt-0.5">{plan.subtitle}</p>

              <div className="mt-4">
                {plan.id === 'TRIAL' ? (
                  <span className="text-3xl font-semibold text-brand-950">$0</span>
                ) : (
                  priceLabel(FIXED_PLAN_PRICES[plan.id as 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM'][billingCycle])
                )}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-brand-950/70 flex-1 font-light">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {plan.capacity}
                </li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>

              {plan.id === 'TRIAL' ? (
                <Link to="/admin/register" className="mt-6 block">
                  <TextureButton variant="primary" size="default">
                    Comenzar prueba gratis
                  </TextureButton>
                </Link>
              ) : (
                <TextureButton
                  variant={plan.highlighted ? 'brand' : 'primary'}
                  size="default"
                  className="mt-6"
                  onClick={() => onChoosePlan(plan.id as Exclude<PlanId, 'TRIAL'>)}
                >
                  Elegir plan
                </TextureButton>
              )}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-brand-950/10 bg-white p-6 shadow-sm sm:col-span-2 lg:col-span-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="lg:w-56 shrink-0">
              <p className="font-semibold text-brand-950">Plan Personalizado</p>
              <p className="text-xs text-brand-950/50 font-light mt-0.5">Arma tu paquete a la medida</p>
              <div className="mt-4">{priceLabel(customPriceUsd)}</div>
            </div>

            <div className="flex-1 grid sm:grid-cols-3 gap-5">
              <CustomSlider
                label="Mesas"
                value={custom.tables}
                onChange={(v) => onCustomChange({ ...custom, tables: v })}
                max={100}
                suffix="+$1 c/u"
              />
              <CustomSlider
                label="Usuarios de tu equipo"
                value={custom.users}
                onChange={(v) => onCustomChange({ ...custom, users: v })}
                max={100}
                suffix="+$1.5 desde el 3ro"
              />
              <CustomSlider
                label="Pedidos al mes"
                value={custom.orders}
                onChange={(v) => onCustomChange({ ...custom, orders: v })}
                max={10000}
                step={100}
                suffix="+$2 c/100"
              />
            </div>

            <TextureButton
              variant="primary"
              size="default"
              className="lg:w-auto lg:px-6 shrink-0"
              onClick={() => onChoosePlan('CUSTOM')}
            >
              Elegir plan
            </TextureButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomSlider({
  label,
  value,
  onChange,
  suffix,
  max = 1000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-brand-950/70">{label}</span>
        <span className="font-semibold text-brand-950">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1.5 accent-brand-500"
      />
      <p className="text-xs text-brand-950/40 mt-0.5">{suffix}</p>
    </label>
  );
}
