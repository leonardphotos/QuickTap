import { useEffect } from 'react';

const ORIGIN = 'https://quicktap.club';

/** Título y descripción por defecto del sitio (los mismos de web/index.html). */
const DEFAULT_TITLE = 'QuickTap — Software para restaurantes: menú QR, pedidos y delivery';
const DEFAULT_DESCRIPTION =
  'Software para gestionar tu restaurante: menú digital QR, pedidos que llegan directo a cocina, delivery por WhatsApp e inventario con recetas. También para locales comerciales y canchas. Prueba gratis 15 días.';

interface SeoProps {
  title: string;
  description: string;
  /** Ruta canónica ("/menu-digital-qr"). Sin dominio: se antepone el de producción. */
  path: string;
  /** Preguntas para el JSON-LD de FAQPage (rich results de Google). */
  faq?: { q: string; a: string }[];
}

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Actualiza título, descripción, canónica y OG al navegar DENTRO de la SPA.
 * La primera carga desde un crawler ya viene con estas etiquetas inyectadas por el
 * backend (src/modules/seo/static-pages.ts — mantener los textos en espejo); este
 * componente cubre la navegación del cliente, donde el HTML servido no cambia.
 */
export function Seo({ title, description, path, faq }: SeoProps) {
  useEffect(() => {
    const canonical = `${ORIGIN}${path}`;
    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('link[rel="canonical"]', 'href', canonical);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);

    let faqScript: HTMLScriptElement | null = null;
    if (faq && faq.length > 0) {
      faqScript = document.createElement('script');
      faqScript.type = 'application/ld+json';
      faqScript.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
      document.head.appendChild(faqScript);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('meta[name="description"]', 'content', DEFAULT_DESCRIPTION);
      setMeta('link[rel="canonical"]', 'href', `${ORIGIN}/`);
      setMeta('meta[property="og:url"]', 'content', `${ORIGIN}/`);
      faqScript?.remove();
    };
  }, [title, description, path, faq]);

  return null;
}
