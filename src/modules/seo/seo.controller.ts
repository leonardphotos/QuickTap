import { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { buildMetaForSlug, buildSitemap, renderShell } from './seo.service';
import { env } from '../../config/env';
import { getStaticSeoPage } from './static-pages';

export const seoController = {
  /** GET /sitemap.xml — páginas fijas + la página pública de cada negocio activo. */
  sitemap: asyncHandler(async (_req: Request, res: Response) => {
    const xml = await buildSitemap();
    res.type('application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  }),

  /**
   * Sirve el shell de la SPA con las etiquetas del negocio ya inyectadas, para
   * `/r/:slug`, `/tienda/:slug` y `/club/:slug` — ver seo.service.ts.
   *
   * `prefix` viene del montaje de la ruta, no de la URL, así que no lo controla
   * el cliente.
   */
  publicPage(prefix: string) {
    return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const meta = await buildMetaForSlug(prefix, req.params.slug);
      const html = renderShell(meta);

      if (!html) {
        // Falta web/dist/index.html: el backend no puede servir la página. Pasa al
        // 404 normal en vez de responder algo a medias, y deja rastro en los logs
        // porque es un error de despliegue (WEB_DIST_PATH mal apuntado), no del usuario.
        console.error('[seo] No se pudo leer web/dist/index.html — revisa WEB_DIST_PATH.');
        return next();
      }

      // Hasta ahora este HTML lo servía Nginx, que no manda CSP. Al pasar a servirlo
      // Express se le aplicaría la CSP por defecto de helmet (`img-src 'self' data:`),
      // que bloquearía las fotos de los negocios alojadas fuera del dominio y rompería
      // la página. Se quita para dejar exactamente el mismo comportamiento de antes
      // (no relaja nada respecto al estado actual; endurecer la CSP del frontend es un
      // trabajo aparte, y habría que hacerlo en Nginx para que aplique a todas las rutas).
      res.removeHeader('Content-Security-Policy');

      res.type('html');
      // Corto a propósito: si el negocio cambia su nombre o su portada, la tarjeta
      // que se comparte en WhatsApp debe actualizarse pronto.
      res.set('Cache-Control', 'public, max-age=300');
      res.send(html);
    });
  },

  /**
   * Páginas SEO fijas (/menu-digital-qr, /precios, /para/bares, …): mismo shell de
   * la SPA con el título/descripción del cluster inyectados en el servidor, para que
   * el crawler los vea sin ejecutar JavaScript. El contenido lo renderiza React.
   *
   * `path` viene del montaje de la ruta (static-pages.ts), no de la URL.
   */
  staticPage(path: string) {
    return asyncHandler(async (_req: Request, res: Response, next: NextFunction) => {
      const page = getStaticSeoPage(path);
      if (!page) return next();

      const origin = env.appUrl.replace(/\/$/, '');
      const html = renderShell({
        title: page.title,
        description: page.description,
        canonical: `${origin}${page.path}`,
        image: `${origin}/logo/quicktap-color.png`,
        indexable: true,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: page.title,
          description: page.description,
          url: `${origin}${page.path}`,
          isPartOf: { '@id': `${origin}/#organization` },
        },
      });

      if (!html) {
        console.error('[seo] No se pudo leer web/dist/index.html — revisa WEB_DIST_PATH.');
        return next();
      }

      res.removeHeader('Content-Security-Policy');
      res.type('html');
      // Contenido editorial: cambia solo con un despliegue, puede cachearse más
      // que la página de un negocio.
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(html);
    });
  },
};
