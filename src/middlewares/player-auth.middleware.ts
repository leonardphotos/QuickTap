import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/http-error';
import type { PlayerAuthPayload } from '../modules/club-players/club-player.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      player?: PlayerAuthPayload;
    }
  }
}

/**
 * Tercer ámbito de autenticación, junto al del staff (`AuthPayload`) y al de la
 * plataforma (`PlatformAuthPayload`).
 *
 * Los tres van firmados con el MISMO secreto, así que lo único que impide
 * replayar un token de un ámbito contra otro es el campo `scope`. Un token de
 * jugador no puede tocar el panel del club, y uno de staff no puede hacerse
 * pasar por jugador.
 *
 * El `restaurantId` sale del token, nunca del body o de la URL — misma regla que
 * el resto del sistema multi-tenant.
 */
export function playerAuthGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Inicia sesión para continuar.'));
  }
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as PlayerAuthPayload;
    if (payload.scope !== 'player' || !payload.playerAccountId || !payload.restaurantId) {
      throw new Error('Token de otro ámbito.');
    }
    req.player = payload;
    next();
  } catch {
    next(unauthorized('Tu sesión venció. Inicia sesión de nuevo.'));
  }
}
