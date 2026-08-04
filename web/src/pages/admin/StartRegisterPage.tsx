import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Store, Utensils, Warehouse } from 'lucide-react';
import AuthLayout from './AuthLayout';
import { cn } from '@/lib/utils';

type StartOption = 'restaurant' | 'shop' | 'warehouse';

const OPTIONS: {
  id: StartOption;
  label: string;
  description: string;
  icon: typeof Utensils;
  disabled?: boolean;
}[] = [
  { id: 'restaurant', label: 'Restaurantes', description: 'Mesas, comandas, cocina y delivery.', icon: Utensils },
  { id: 'shop', label: 'Locales Comerciales', description: 'Punto de venta, inventario y variantes por producto.', icon: Store },
  { id: 'warehouse', label: 'Almacenes', description: 'Próximamente.', icon: Warehouse, disabled: true },
];

/**
 * Primera pantalla del registro: elegir el rubro/vertical del negocio antes de llenar
 * cualquier dato. "Restaurantes" sigue al registro de siempre (/admin/register) sin cambios;
 * "Locales Comerciales" pasa primero por el selector de 23 rubros (ShopRubroPage) y de ahí
 * cae en el mismo formulario, marcado como Shop; "Almacenes" todavía no existe.
 */
export default function StartRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();

  function choose(option: StartOption) {
    // Reenvía location.state (datos ya verificados de "Continuar con Google" desde
    // /admin/login, ver LoginPage.tsx) — sin esto se pierden al pasar por acá.
    if (option === 'restaurant') navigate(`/admin/register${qs ? `?${qs}` : ''}`, { state: location.state });
    if (option === 'shop') navigate(`/admin/register/rubro${qs ? `?${qs}` : ''}`, { state: location.state });
  }

  return (
    <AuthLayout title="¿Qué tipo de negocio tienes?">
      <div className="space-y-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => choose(opt.id)}
              className={cn(
                'w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-colors',
                opt.disabled
                  ? 'border-brand-950/10 bg-brand-950/[0.02] cursor-not-allowed'
                  : 'border-brand-950/10 hover:border-brand-400 hover:bg-brand-500/5 cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  opt.disabled ? 'bg-brand-950/5 text-brand-950/30' : 'bg-brand-500/10 text-brand-500',
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className={cn('block font-semibold', opt.disabled ? 'text-brand-950/40' : 'text-brand-950')}>
                  {opt.label}
                </span>
                <span className="block text-xs text-brand-950/50 font-light">{opt.description}</span>
              </span>
              {opt.disabled && (
                <span className="shrink-0 rounded-full bg-brand-950/5 px-2.5 py-1 text-[11px] font-semibold text-brand-950/40">
                  Próximamente
                </span>
              )}
            </button>
          );
        })}
      </div>
    </AuthLayout>
  );
}
