import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { unauthorized } from '../../utils/http-error';
import type { WalletPayload } from './wallet.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      walletCustomerId?: string;
    }
  }
}

/**
 * Verifica el token de QuickTap Wallet.
 *
 * Exige un scope de Wallet explícitamente: los tres ámbitos del sistema (negocio, plataforma y
 * cliente) se firman con el mismo secreto, así que sin esta comprobación el token de un cliente
 * serviría para entrar al panel de un negocio.
 */
export function walletGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Inicia sesión para ver tus compras.');
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as WalletPayload;
    // 'pass' sigue valiendo: es el scope con el que se firmaron los tokens antes de que el
    // producto pasara a llamarse Wallet, y duran 30 días. Rechazarlos habría sacado del portal
    // a todo el que tuviera sesión abierta el día del cambio.
    if ((payload.scope !== 'wallet' && payload.scope !== 'pass') || !payload.customerId) {
      throw unauthorized('Sesión no válida.');
    }
    req.walletCustomerId = payload.customerId;
    next();
  } catch {
    throw unauthorized('Tu sesión venció. Vuelve a entrar.');
  }
}
