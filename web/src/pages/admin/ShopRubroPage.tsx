import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SHOP_RUBROS } from '@/data/shopRubros';

/**
 * Segundo paso del registro de "Locales Comerciales" (ver StartRegisterPage): elegir uno de
 * los 23 rubros de retail. El rubro elegido viaja como query param hasta RegisterPage, que lo
 * guarda en Restaurant.shopRubro — de ahí lo lee ShopLayout para poblar el catálogo de ejemplo.
 *
 * No reutiliza <AuthLayout> (fijo en max-w-sm, pensado para formularios angostos) porque la
 * grilla de 23 rubros necesita más ancho — pero replica su mismo look (fondo blanco, logo y
 * título centrados) para que el flujo se sienta continuo.
 */
export default function ShopRubroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function choose(rubroId: string) {
    const params = new URLSearchParams(searchParams);
    params.set('businessType', 'shop');
    params.set('rubro', rubroId);
    navigate(`/admin/register?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-6 pt-20 pb-16 sm:pt-28">
      <Link to="/" className="mb-10">
        <img src="/logo/icno-web.png" alt="QuickTap" className="h-12 w-auto mx-auto" />
      </Link>
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold text-brand-950 text-center mb-8">¿Cuál es el rubro de tu negocio?</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SHOP_RUBROS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => choose(r.id)}
              className="flex flex-col items-start gap-1.5 rounded-2xl border border-brand-950/10 px-3.5 py-3.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-500/5"
            >
              <span className="text-xl leading-none">{r.emoji}</span>
              <span className="text-[12.5px] font-semibold leading-tight text-brand-950">{r.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
