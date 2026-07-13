import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { HttpError } from '../utils/http-error';
import { env } from '../config/env';

/** Wrapper para controladores async: propaga errores al middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      details: err.flatten(),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof MulterError) {
    return res.status(400).json({ error: 'No se pudo procesar el archivo subido.', details: err.message });
  }

  // Violación de restricción única de Prisma (ej: slug o email duplicado).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({
      error: 'Ya existe un registro con esos datos únicos.',
      fields: err.meta?.target,
    });
  }

  const message = err instanceof Error ? err.message : 'Error interno del servidor';
  if (!env.isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  return res.status(500).json({ error: env.isProd ? 'Error interno del servidor' : message });
}
