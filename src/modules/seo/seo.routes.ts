import { Router } from 'express';
import { seoController } from './seo.controller';
import { PUBLIC_PREFIXES } from './seo.service';

/**
 * Rutas que ve el usuario en la barra de direcciones (no API): se montan en la
 * raíz, no bajo /api/v1. Nginx enruta estos paths al backend en vez de servir
 * el estático — ver deploy/nginx.conf.example.
 */
const router = Router();

router.get('/sitemap.xml', seoController.sitemap);

// /r/:slug, /tienda/:slug, /club/:slug — el prefijo sale de PUBLIC_PREFIXES para
// que la lista viva en un solo lugar junto al mapeo a su vertical de negocio.
for (const prefix of Object.keys(PUBLIC_PREFIXES)) {
  router.get(`${prefix}/:slug`, seoController.publicPage(prefix));
}

export default router;
