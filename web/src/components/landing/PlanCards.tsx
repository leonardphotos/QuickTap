import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/api/client';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, FIXED_PLAN_PRICES, type BillingCycle, type PlanId } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

export interface PlanContent {
  id: 'DELIVERY' | 'PRO' | 'SUCURSALES' | 'DELIVERY_SUCURSALES';
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
  {
    id: 'SUCURSALES',
    name: 'Plan Sucursales',
    subtitle: 'Todos los beneficios de Pro, en hasta 5 sucursales',
    capacity: 'Hasta 5 sucursales, cada una con mesas y pedidos ilimitados',
    features: [
      'Todos los beneficios del Plan Pro en cada sucursal',
      'Cada sucursal con su propio catálogo, inventario, mesas y equipo',
      'Reporte consolidado de ventas: sede principal + cada sucursal',
      'Inventario por sucursal: qué falta reabastecer en cada una',
      'Productos más vendidos por sucursal',
      'Equipo de trabajo por sucursal',
    ],
  },
  {
    id: 'DELIVERY_SUCURSALES',
    name: 'Delivery Sucursales',
    subtitle: 'Todos los beneficios de Solo Delivery, en hasta 5 sucursales',
    capacity: 'Hasta 5 sucursales — sin mesas ni códigos QR',
    features: [
      'Productos, Cocinas y Sección de Delivery en cada sucursal',
      'Cada sucursal con su propio catálogo, inventario y equipo',
      'Reporte consolidado de ventas: sede principal + cada sucursal',
      'Inventario por sucursal: qué falta reabastecer en cada una',
      'Productos más vendidos por sucursal',
    ],
  },
];

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  onChoosePlan: (plan: Exclude<PlanId, 'TRIAL' | 'STARTER' | 'PREMIUM' | 'CUSTOM'>) => void;
}

interface FetchedPlan {
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  prices: Record<BillingCycle, number>;
}

export function PlanCards({ rateBs, billingCycle, onBillingCycleChange, onChoosePlan }: Props) {
  // Precios/descripción editables desde el Dashboard maestro; hasta que carguen,
  // se muestran los valores por defecto (PLAN_CONTENT/FIXED_PLAN_PRICES).
  const [dynamicContent, setDynamicContent] = useState<Record<string, FetchedPlan> | null>(null);

  useEffect(() => {
    api
      .get('/public/plans')
      .then((res) => setDynamicContent(res.data.data ?? null))
      .catch(() => {});
  }, []);

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
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-[background-color,color,transform] duration-200 ease-out-strong active:scale-[0.96] ${
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
        {PLAN_CONTENT.map((plan) => {
          const isSucursales = plan.id === 'SUCURSALES' || plan.id === 'DELIVERY_SUCURSALES';
          const d = dynamicContent?.[plan.id];
          const name = d?.name ?? plan.name;
          const subtitle = d?.subtitle ?? plan.subtitle;
          const capacity = d?.capacity ?? plan.capacity;
          const features = d?.features ?? plan.features;
          const price = d?.prices[billingCycle] ?? FIXED_PLAN_PRICES[plan.id][billingCycle];
          return (
          <div key={plan.id} className="relative">
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                Más popular
              </span>
            )}
            {isSucursales && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-[#D4AF37] text-white text-xs font-medium px-3 py-1 rounded-full shadow-[0_4px_12px_-2px_rgba(212,175,55,0.6)]">
                ✨ Premium
              </span>
            )}
            <div
              className={`h-full flex flex-col rounded-2xl border bg-white p-6 ${
                plan.highlighted
                  ? 'border-brand-400/40 shadow-[0_16px_40px_-20px_rgba(5,108,242,0.45)]'
                  : isSucursales
                    ? 'border-2 border-[#D4AF37] shadow-[0_16px_40px_-20px_rgba(212,175,55,0.5)]'
                    : 'border-brand-950/10 shadow-sm'
              }`}
            >
              <p className="font-semibold text-brand-950">{name}</p>
              <p className="text-xs text-brand-950/50 font-light mt-0.5">{subtitle}</p>

              <div className="mt-4">{priceLabel(price)}</div>

              <ul className="mt-4 space-y-2 text-sm text-brand-950/70 flex-1 font-light">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {capacity}
                </li>
                {features.map((f) => (
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
          );
        })}
      </div>
    </div>
  );
}
