import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { getSeoVertical } from '@/data/seoPages';
import { SeoFaqList, SeoPageLayout } from './SeoPageLayout';

/**
 * Páginas por tipo de negocio (/para/bares, /para/pizzerias… — cluster H del plan
 * SEO). Son la misma oferta reempaquetada: copy corto y propio, que REFERENCIA a
 * las páginas de servicio en vez de duplicarlas.
 */
export default function VerticalPage() {
  const { vertical } = useParams<{ vertical: string }>();
  const page = getSeoVertical(vertical ?? '');
  if (!page) return <Navigate to="/" replace />;

  return (
    <SeoPageLayout>
      <Seo title={page.title} description={page.description} path={`/para/${page.slug}`} faq={page.faq} />

      <p className="text-xs font-bold uppercase tracking-widest text-brand-logo">QuickTap para tu negocio</p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight max-w-3xl">{page.h1}</h1>
      <div className="mt-5 space-y-4 max-w-3xl">
        {page.intro.map((p) => (
          <p key={p.slice(0, 40)} className="text-brand-950/70 font-light leading-relaxed">{p}</p>
        ))}
      </div>

      <section className="mt-10 grid sm:grid-cols-3 gap-5">
        {page.points.map((pt) => (
          <Link
            key={pt.title}
            to={pt.to}
            className="group rounded-2xl border border-brand-950/[0.08] p-5 hover:border-brand-logo/40 transition-colors"
          >
            <h2 className="text-[15px] font-semibold mb-1.5 group-hover:text-brand-logo transition-colors">{pt.title}</h2>
            <p className="text-sm text-brand-950/60 font-light leading-relaxed">{pt.text}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-logo">
              Ver cómo funciona <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </section>

      <SeoFaqList faq={page.faq} />
    </SeoPageLayout>
  );
}
