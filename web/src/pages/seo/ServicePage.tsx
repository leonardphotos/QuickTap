import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { getSeoService } from '@/data/seoPages';
import { SeoFaqList, SeoPageLayout } from './SeoPageLayout';

/**
 * Plantilla de las 6 páginas de servicio (clusters A–F del plan SEO). El contenido
 * vive en web/src/data/seoPages.ts; aquí solo está la presentación.
 */
export default function ServicePage({ slug }: { slug: string }) {
  const page = getSeoService(slug);
  if (!page) return <Navigate to="/" replace />;

  return (
    <SeoPageLayout>
      <Seo title={page.title} description={page.description} path={`/${page.slug}`} faq={page.faq} />

      <p className="text-xs font-bold uppercase tracking-widest text-brand-logo">{page.eyebrow}</p>
      <h1 className="mt-3 text-2xl sm:text-3xl font-bold leading-tight max-w-3xl">{page.h1}</h1>
      <div className="mt-5 space-y-4 max-w-3xl">
        {page.intro.map((p) => (
          <p key={p.slice(0, 40)} className="text-[15px] text-brand-950/70 font-light leading-relaxed">{p}</p>
        ))}
      </div>

      {page.screenshot && (
        <div className="mt-10 mx-auto max-w-3xl overflow-hidden rounded-2xl border border-brand-950/10 shadow-[0_20px_50px_-24px_rgba(0,27,67,0.35)]">
          <img src={page.screenshot.src} alt={page.screenshot.alt} loading="lazy" className="h-auto w-full max-h-[480px] object-cover object-top" />
        </div>
      )}

      <section className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {page.features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-brand-950/[0.08] p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              </span>
              <h2 className="text-sm font-semibold">{f.title}</h2>
            </div>
            <p className="text-[13px] text-brand-950/60 font-light leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      {page.sections?.map((s) => (
        <section key={s.title} className="mt-10 max-w-3xl">
          <h2 className="text-lg sm:text-xl font-bold mb-2">{s.title}</h2>
          <p className="text-[15px] text-brand-950/70 font-light leading-relaxed">{s.text}</p>
        </section>
      ))}

      <SeoFaqList faq={page.faq} />

      <section className="mt-12">
        <h2 className="text-sm font-bold uppercase tracking-widest text-brand-950/40 mb-3">También te puede interesar</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          {page.related.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="flex items-center justify-between gap-2 flex-1 rounded-xl border border-brand-950/[0.08] px-4 py-3 text-sm font-medium hover:border-brand-logo/40 hover:text-brand-logo transition-colors"
            >
              {r.label}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </SeoPageLayout>
  );
}
