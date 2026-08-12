import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiV1 from './routes';
import seoRoutes from './modules/seo/seo.routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { UPLOADS_DIR } from './middlewares/upload.middleware';

// Body crudo (antes de que express.json lo parsee) para verificar firmas de
// webhooks (HMAC calculado sobre los bytes exactos que mandó el remitente,
// nunca sobre un JSON re-serializado). Se guarda en cada request; el costo es
// despreciable frente al límite de 1mb ya impuesto abajo.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createApp() {
  const app = express();

  // Nginx (misma máquina) es el único proxy delante de la app: sin esto,
  // Express ve todas las requests viniendo de 127.0.0.1 y el rate-limit de
  // /auth (ver rate-limit.middleware.ts) contaría a todos los clientes como
  // uno solo en vez de por IP real.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );

  // Healthcheck
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'quicktap-api' }));

  // Fotos de producto subidas por el restaurante (almacenamiento local en disco).
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api/v1', apiV1);

  // SEO: sitemap.xml y las páginas públicas por negocio (/r/, /tienda/, /club/), que
  // se sirven desde el backend para poder inyectarles las etiquetas del negocio antes
  // de mandar el HTML — ver src/modules/seo/seo.service.ts. Van en la raíz (son URLs
  // que ve el usuario, no API) y Nginx las enruta acá en vez de servir el estático.
  app.use(seoRoutes);

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // Manejador de errores (siempre al final)
  app.use(errorMiddleware);

  return app;
}
