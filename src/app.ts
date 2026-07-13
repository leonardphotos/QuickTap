import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiV1 from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { UPLOADS_DIR } from './middlewares/upload.middleware';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Healthcheck
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'quicktap-api' }));

  // Fotos de producto subidas por el restaurante (almacenamiento local en disco).
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api/v1', apiV1);

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // Manejador de errores (siempre al final)
  app.use(errorMiddleware);

  return app;
}
