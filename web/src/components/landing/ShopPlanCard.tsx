import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/api/client';
import { formatBs } from '@/utils/format';
import { BILLING_CYCLE_LABEL, FIXED_PLAN_PRICES, type BillingCycle } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

const SHOP_PLAN_NAME = 'QuickTap Shop';
const SHOP_PLAN_SUBTITLE = 'Todos los beneficios de QuickTap para tiendas, ropa, calzado, ferreterías, farmacias y más';

const SHOP_PLAN_FEATURES = [
  'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
  'Inventario con foto obligatoria, variantes de talla/color o stock básico',
  'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
  'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Ingresos por método de pago, margen de utilidad y productos más vendidos',
  'Alertas de stock bajo y productos próximos a vencer',
  'Directorio de clientes y roles de equipo (Dueño, Administrador, Cajero)',
];

const CYCLE_MONTHS: Record<BillingCycle, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6 };

interface FetchedPlan {
  name: string;
  subtitle: string;
  features: string[];
  prices: Record<BillingCycle, number>;
}

interface Props {
  rateBs: string | null;
  billingCycle: BillingCycle;
  onBillingCycleChange: (c: BillingCycle) => void;
  onChoosePlan: (plan: 'SHOP') => void;
}

/**
 * Único plan de QuickTap Shop — a diferencia de PlanCards (Restaurantes) no hay varios
 * niveles, pero nombre/beneficios/precio por ciclo SÍ son editables desde el Dashboard
 * maestro (Planes → QuickTap Shop, ver DEFAULT_PLAN_CONTENT.SHOP en
 * platform-settings.service.ts): esto solo trae los valores por defecto mientras carga.
 */
export function ShopPlanCard({ rateBs, billingCycle, onBillingCycleChange, onChoosePlan }: Props) {
  const [dynamicContent, setDynamicContent] = useState<FetchedPlan | null>(null);
  // Misma moneda de cobro que los planes de Restaurante (Dashboard maestro → Planes →
  // Moneda de cobro): es una sola configuración para toda la plataforma, no por vertical.
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [ownRateBs, setOwnRateBs] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/public/plans')
      .then((res) => setDynamicContent(res.data.data?.SHOP ?? null))
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

  const name = dynamicContent?.name ?? SHOP_PLAN_NAME;
  const subtitle = dynamicContent?.subtitle ?? SHOP_PLAN_SUBTITLE;
  const features = dynamicContent?.features ?? SHOP_PLAN_FEATURES;
  const price = dynamicContent?.prices[billingCycle] ?? FIXED_PLAN_PRICES.SHOP[billingCycle];
  const monthlyPrice = dynamicContent?.prices.MONTHLY ?? FIXED_PLAN_PRICES.SHOP.MONTHLY;
  const months = CYCLE_MONTHS[billingCycle];
  const totalSavings = Math.max(0, (monthlyPrice - price) * months);
  const showSavings = billingCycle !== 'MONTHLY' && totalSavings > 0.01;

  return (
    <div>
      <div className="flex items-center justify-center gap-1 mb-8">
        <div className="inline-flex gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.05] p-1.5">
          {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const).map((c) => {
            const active = billingCycle === c;
            const base = FIXED_PLAN_PRICES.SHOP.MONTHLY;
            const off = c === 'MONTHLY' ? 0 : Math.round((1 - FIXED_PLAN_PRICES.SHOP[c] / base) * 100);
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

      <div className="max-w-md mx-auto">
        <div className="h-full flex flex-col rounded-2xl border border-brand-400/40 bg-white p-6 shadow-[0_16px_40px_-20px_rgba(5,108,242,0.45)]">
          <p className="font-semibold text-brand-950">{name}</p>
          <p className="text-xs text-brand-950/50 font-light mt-0.5">{subtitle}</p>

          <div className="mt-4 flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-bold text-brand-950 tracking-tight">
                {currencySymbol}
                {price.toFixed(2)}
              </span>
              <span className="text-xs text-brand-950/40 font-medium">/mes</span>
              {billingCycle !== 'MONTHLY' && (
                <span className="text-sm text-brand-950/35 line-through">
                  {currencySymbol}
                  {monthlyPrice.toFixed(2)}
                </span>
              )}
            </div>
            {effectiveRateBs && <p className="text-[11px] text-brand-950/45">{formatBs(price, effectiveRateBs)}/mes · a tasa BCV</p>}
            <span
              className={`self-start mt-2 inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 transition-opacity duration-200 ${
                showSavings ? 'opacity-100 bg-emerald-50 text-emerald-700' : 'opacity-0 pointer-events-none'
              }`}
            >
              ◆ Ahorras {currencySymbol}
              {totalSavings.toFixed(0)} en el ciclo
            </span>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-brand-950/70 flex-1 font-light pt-4 border-t border-brand-950/[0.06]">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>

          <TextureButton variant="brand" size="default" className="mt-6" onClick={() => onChoosePlan('SHOP')}>
            Elegir plan
          </TextureButton>
        </div>
      </div>
    </div>
  );
}
