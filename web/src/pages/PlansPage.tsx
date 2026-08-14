import { Link } from 'react-router-dom';
import { PricingSection } from '@/components/landing/PricingSection';
import { TextureButton } from '@/components/ui/texture-button';
import { Seo } from '@/components/Seo';

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-white text-brand-950">
      {/* Mismo title/description que /precios en static-pages.ts (backend). */}
      <Seo
        title="Software para restaurantes: precios y planes | QuickTap"
        description="Planes de QuickTap para restaurantes, locales comerciales y canchas: precios claros en dólares, pago en bolívares a tasa BCV y prueba gratis de 15 días sin tarjeta."
        path="/precios"
      />
      {/* Nav flotante, mismo estilo que las demás páginas públicas */}
      <header className="fixed top-4 inset-x-0 z-30 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 rounded-full bg-brand-950/80 backdrop-blur-md border border-white/10 shadow-lg shadow-brand-950/30 px-4 py-2">
          <Link to="/">
            <img src="/logo/icono-blanco.png" alt="QuickTap" className="h-7 w-7" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
              Todo lo que hace
            </Link>
            <Link to="/admin/login" className="text-sm text-white/70 hover:text-white px-2 py-1.5">
              Iniciar sesión
            </Link>
            <Link
              to="/empezar"
              className="text-sm font-medium bg-white text-brand-950 rounded-full px-3 py-1.5 hover:bg-white/90"
            >
              Regístrate
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-24">
        <PricingSection />
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-brand-950/10 bg-brand-950/[0.03]">
        <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo/icono.png" alt="" className="h-7 w-7" />
            <p className="text-sm text-brand-950/60 font-light">
              © {new Date().getFullYear()} QuickTap.club — todo a un toque.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-brand-950/70 hover:text-brand-950">
              Todo lo que hace
            </Link>
            <Link to="/legal" className="text-sm text-brand-950/70 hover:text-brand-950">
              Legal
            </Link>
            <Link to="/admin/login" className="text-sm text-brand-950/70 hover:text-brand-950">
              Iniciar sesión
            </Link>
            <Link to="/empezar">
              <TextureButton variant="primary" size="sm" className="!w-auto">
                Regístrate y comienza gratis hoy
              </TextureButton>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
