import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SEO_SERVICES, SEO_VERTICALS } from '@/data/seoPages';

/**
 * Marco común de las páginas SEO (servicios, verticales y comparativa): cabecera
 * ligera, CTA de registro y un pie con TODO el mapa de páginas — ese pie es el
 * enlazado interno que reparte autoridad entre clusters sin ensuciar el copy.
 */
export function SeoPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-brand-950">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-brand-950/[0.06]">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center min-w-0">
            <img src="/logo/icono.png" alt="QuickTap" className="h-7 w-7" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/precios" className="text-sm text-brand-950/70 hover:text-brand-950 px-1.5 py-1">
              Precios
            </Link>
            <Link to="/admin/login" className="hidden sm:inline text-sm text-brand-950/70 hover:text-brand-950 px-1.5 py-1">
              Iniciar sesión
            </Link>
            <Link
              to="/empezar"
              className="inline-flex items-center justify-center rounded-full bg-brand-logo text-white font-medium text-xs px-4 py-2 transition-colors hover:bg-[#008ae6] active:scale-[0.97]"
            >
              Prueba gratis
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10 lg:py-14">{children}</main>

      {/* CTA de cierre — igual en todas las páginas SEO */}
      <section className="max-w-5xl mx-auto px-5 pb-14">
        <div className="rounded-3xl bg-brand-logo text-white px-6 py-10 sm:px-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Pruébalo con tu propio negocio</h2>
          <p className="mt-2 text-white/80 font-light max-w-xl mx-auto">
            15 días gratis, sin tarjeta de crédito. Configura tu carta, tus mesas y tu WhatsApp en una tarde.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/empezar"
              className="inline-flex items-center justify-center rounded-full bg-white text-brand-logo font-semibold text-base px-6 py-3 shadow-[0_16px_32px_-8px_rgba(0,27,67,0.35)] transition-transform duration-200 active:scale-[0.97] hover:bg-white/90"
            >
              Regístrate y comienza gratis hoy
            </Link>
            <Link to="/precios" className="text-sm text-white/80 hover:text-white underline underline-offset-4">
              Ver precios y planes
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-brand-950/10 bg-[#fafafa]">
        <div className="max-w-5xl mx-auto px-5 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
          <div>
            <p className="font-semibold mb-3">Funciones</p>
            <ul className="space-y-2">
              {SEO_SERVICES.map((s) => (
                <li key={s.slug}>
                  <Link to={`/${s.slug}`} className="text-brand-950/60 hover:text-brand-950">
                    {s.eyebrow}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Por tipo de negocio</p>
            <ul className="space-y-2">
              {SEO_VERTICALS.map((v) => (
                <li key={v.slug}>
                  <Link to={`/para/${v.slug}`} className="text-brand-950/60 hover:text-brand-950">
                    {v.h1.replace('Software para ', 'Para ')}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">QuickTap</p>
            <ul className="space-y-2">
              <li><Link to="/" className="text-brand-950/60 hover:text-brand-950">Software para restaurantes</Link></li>
              <li><Link to="/precios" className="text-brand-950/60 hover:text-brand-950">Precios y planes</Link></li>
              <li><Link to="/comparativa" className="text-brand-950/60 hover:text-brand-950">Cómo elegir un software</Link></li>
              <li><Link to="/legal" className="text-brand-950/60 hover:text-brand-950">Legal</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Empezar</p>
            <ul className="space-y-2">
              <li><Link to="/empezar" className="text-brand-950/60 hover:text-brand-950">Crear cuenta gratis</Link></li>
              <li><Link to="/admin/login" className="text-brand-950/60 hover:text-brand-950">Iniciar sesión</Link></li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-brand-950/40 font-light pb-6">
          © {new Date().getFullYear()} QuickTap.club — todo a un toque.
        </p>
      </footer>
    </div>
  );
}

/** FAQ accesible y visible para el crawler: <details> nativo, sin JavaScript. */
export function SeoFaqList({ faq }: { faq: { q: string; a: string }[] }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl sm:text-2xl font-bold mb-4">Preguntas frecuentes</h2>
      <div className="divide-y divide-brand-950/[0.08] border-y border-brand-950/[0.08]">
        {faq.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-semibold">
              {f.q}
              <span className="text-brand-950/40 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
            </summary>
            <p className="mt-2 text-brand-950/70 font-light leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
