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

  // Registro no encontrado al actualizar/borrar (ej: el restaurante del token ya no
  // existe). En el entorno demo esto pasa cuando el restaurante se reseteó mientras
  // la sesión seguía activa (ver demo-reset.service.ts) — se responde 401 en vez de
  // 500 para que el frontend limpie el token y mande a loguearse de nuevo, en vez de
  // mostrar "Error interno del servidor" ante lo que en realidad es una sesión vencida.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(401).json({ error: 'Tu sesión ya no es válida. Inicia sesión de nuevo.' });
  }

  const message = err instanceof Error ? err.message : 'Error interno del servidor';
  // Siempre queda en los logs del servidor (pm2), aunque en prod el cliente
  // solo reciba un mensaje genérico.

  console.error(err);
  return res.status(500).json({ error: env.isProd ? 'Error interno del servidor' : message });
}
