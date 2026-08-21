import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { unauthorized } from '../../utils/http-error';
import type { PassPayload } from './pass.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      passCustomerId?: string;
    }
  }
}

/**
 * Verifica el token de QuickTap Pass.
 *
 * Exige `scope: 'pass'` explícitamente: los tres ámbitos del sistema (negocio, plataforma y
 * cliente) se firman con el mismo secreto, así que sin esta comprobación el token de un cliente
 * serviría para entrar al panel de un negocio.
 */
export function passGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Inicia sesión para ver tus compras.');
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as PassPayload;
    if (payload.scope !== 'pass' || !payload.customerId) throw unauthorized('Sesión no válida.');
    req.passCustomerId = payload.customerId;
    next();
  } catch {
    throw unauthorized('Tu sesión venció. Vuelve a entrar.');
  }
}
