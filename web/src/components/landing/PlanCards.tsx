import { Check } from 'lucide-react';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, CUSTOM_ADDON_PRICES, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
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
    id: 'DELIVERY',
    name: 'Solo Delivery',
    subtitle: 'Cocinas fantasma o solo pedidos por WhatsApp',
    capacity: 'Sin mesas ni códigos QR — acceso directo a Cocina',
    features: ['700 pedidos al mes', 'Hasta 6 usuarios de tu equipo'],
  },
  {
    id: 'STARTER',
    name: 'Plan Inicial',
    subtitle: 'Food trucks o cafés pequeños',
    capacity: 'Hasta 5-6 mesas',
    features: ['500 pedidos al mes', 'Hasta 4 usuarios de tu equipo'],
  },
  {
    id: 'PRO',
    name: 'Plan Pro / Restaurante',
    subtitle: 'El punto ideal para la mayoría',
    capacity: 'Hasta 20 mesas',
    features: [
      '700 pedidos al mes',
      'Hasta 8 usuarios de tu equipo',
      'Administración: historial de pedidos, propinas y reportes de ventas',
      'Inventario normal (por producto) y Cuentas por pagar',
    ],
    highlighted: true,
  },
  {
    id: 'PREMIUM',
    name: 'Plan Premium',
    subtitle: 'Locales de alto flujo',
    capacity: 'Mesas ilimitadas',
    features: [
      'Pedidos ilimitados',
      'Hasta 20 usuarios de tu equipo',
      'Administración: historial de pedidos, propinas y reportes de ventas',
      'Inventario por receta: descuenta insumos automáticamente al vender',
      'Cuentas por pagar: cuentas abiertas pendientes de cobro',
    ],
  },
];

export interface CustomPlanValues {
  tables: number;
  users: number;
  orders: number;
  administration: boolean;
  inventoryBasic: boolean;
  inventoryRecipe: boolean;
  accountsPayable: boolean;
}

const CUSTOM_ADDON_OPTIONS: { key: keyof CustomPlanValues; label: string; price: number }[] = [
  { key: 'administration', label: 'Sistema administrativo', price: CUSTOM_ADDON_PRICES.administration },
  { key: 'inventoryBasic', label: 'Inventario normal (por producto)', price: CUSTOM_ADDON_PRICES.inventoryBasic },
  { key: 'inventoryRecipe', label: 'Inventario por receta', price: CUSTOM_ADDON_PRICES.inventoryRecipe },
  { key: 'accountsPayable', label: 'Cuentas por pagar', price: CUSTOM_ADDON_PRICES.accountsPayable },
];

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  custom: CustomPlanValues;
  onCustomChange: (v: CustomPlanValues) => void;
  customPriceUsd: number;
  onChoosePlan: (plan: Exclude<PlanId, 'TRIAL'>) => void;
}

export function PlanCards({
  rateBs,
  billingCycle,
  onBillingCycleChange,
  custom,
  onCustomChange,
  customPriceUsd,
  onChoosePlan,
}: Props) {
  function priceLabel(usd: number) {
    return (
      <>
        <span className="text-3xl font-semibold text-brand-950">${usd.toFixed(2)}</span>
        <span className="text-brand-950/60">/mes</span>
        {rateBs && <p className="text-xs text-brand-950/50 mt-0.5">{formatBs(usd, rateBs)}/mes · a tasa BCV</p>}
      </>
    );
  }

  const plans = PLAN_CONTENT;

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-8">
        {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const).map((c) => (
          <button
            key={c}
            onClick={() => onBillingCycleChange(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              billingCycle === c
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
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
                {priceLabel(FIXED_PLAN_PRICES[plan.id as 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM'][billingCycle])}
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

              <TextureButton
                variant={plan.highlighted ? 'brand' : 'primary'}
                size="default"
                className="mt-6"
                onClick={() => onChoosePlan(plan.id as Exclude<PlanId, 'TRIAL'>)}
              >
                Elegir plan
              </TextureButton>
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

            <div className="flex-1 space-y-5">
              <div className="grid sm:grid-cols-3 gap-5">
                <CustomSlider
                  label="Mesas"
                  value={custom.tables}
                  onChange={(v) => onCustomChange({ ...custom, tables: v })}
                  max={100}
                  suffix="+$1.25 c/u"
                />
                <CustomSlider
                  label="Usuarios de tu equipo"
                  value={custom.users}
                  onChange={(v) => onCustomChange({ ...custom, users: v })}
                  max={100}
                  suffix="+$1.88 desde el 3ro"
                />
                <CustomSlider
                  label="Pedidos al mes"
                  value={custom.orders}
                  onChange={(v) => onCustomChange({ ...custom, orders: v })}
                  max={10000}
                  step={100}
                  suffix="+$2.50 c/100"
                />
              </div>

              <div>
                <p className="text-sm text-brand-950/70 mb-2">Adicionales</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {CUSTOM_ADDON_OPTIONS.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2 text-sm text-brand-950/70 rounded-lg border border-brand-950/10 px-3 py-2 cursor-pointer hover:border-brand-400/50"
                    >
                      <input
                        type="checkbox"
                        checked={custom[opt.key] as boolean}
                        onChange={(e) => onCustomChange({ ...custom, [opt.key]: e.target.checked })}
                        className="accent-brand-500"
                      />
                      {opt.label} <span className="text-brand-950/40">+${opt.price}/mes</span>
                    </label>
                  ))}
                </div>
              </div>
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
