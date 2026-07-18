import { Check } from 'lucide-react';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

export interface PlanContent {
  id: 'DELIVERY' | 'PRO';
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
    features: ['Productos', 'Cocinas', 'Sección de Delivery', 'Pedidos ilimitados', 'Hasta 6 usuarios de tu equipo'],
  },
  {
    id: 'PRO',
    name: 'Plan Pro',
    subtitle: 'Todos los beneficios de QuickTap',
    capacity: 'Mesas y pedidos ilimitados',
    features: [
      'Usuarios ilimitados',
      'Administración: historial de pedidos, propinas, Estadísticas y reportes de ventas',
      'Margen de utilidad por producto',
      'Inventario por receta: descuenta insumos automáticamente al vender',
      'Gastos: proveedores, categorías de egreso y balance',
      'Cuentas por pagar: cuentas abiertas pendientes de cobro',
    ],
    highlighted: true,
  },
];

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  onChoosePlan: (plan: Exclude<PlanId, 'TRIAL' | 'STARTER' | 'PREMIUM' | 'CUSTOM'>) => void;
}

export function PlanCards({ rateBs, billingCycle, onBillingCycleChange, onChoosePlan }: Props) {
  function priceLabel(usd: number) {
    return (
      <>
        <span className="text-3xl font-semibold text-brand-950">${usd.toFixed(2)}</span>
        <span className="text-brand-950/60">/mes</span>
        {rateBs && <p className="text-xs text-brand-950/50 mt-0.5">{formatBs(usd, rateBs)}/mes · a tasa BCV</p>}
      </>
    );
  }

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

      <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
        {PLAN_CONTENT.map((plan) => (
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

              <div className="mt-4">{priceLabel(FIXED_PLAN_PRICES[plan.id][billingCycle])}</div>

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
                onClick={() => onChoosePlan(plan.id)}
              >
                Elegir plan
              </TextureButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
