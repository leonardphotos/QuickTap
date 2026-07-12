import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/http-error';

/**
 * Payload del JWT. Lleva SIEMPRE el `restaurantId` para forzar el aislamiento
 * multi-inquilino en cada request autenticada.
 */
export interface AuthPayload {
  userId: string;
  restaurantId: string;
  role: string;
}

// Extiende el Request de Express con el usuario autenticado + el tenant.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      restaurantId?: string;
    }
  }
}

export function authGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Falta el token Bearer.');
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = payload;
    // El tenant activo se deriva SIEMPRE del token, nunca del body/params.
    req.restaurantId = payload.restaurantId;
    next();
  } catch {
    throw unauthorized('Token inválido o expirado.');
  }
}
