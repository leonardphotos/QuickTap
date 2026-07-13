import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/http-error';

/**
 * Payload del JWT del Dashboard maestro (equipo de QuickTap, no un
 * restaurante). `scope: 'platform'` evita que un token de un restaurante
 * (o viceversa) se cuele en las rutas equivocadas.
 */
export interface PlatformAuthPayload {
  platformAdminId: string;
  scope: 'platform';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      platformAuth?: PlatformAuthPayload;
    }
  }
}

export function platformAuthGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Falta el token Bearer.');
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as PlatformAuthPayload;
    if (payload.scope !== 'platform') throw new Error('Token de otro ámbito.');
    req.platformAuth = payload;
    next();
  } catch {
    throw unauthorized('Token inválido o expirado.');
  }
}
