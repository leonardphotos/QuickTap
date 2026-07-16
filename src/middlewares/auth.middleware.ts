import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { forbidden, HttpError, unauthorized } from '../utils/http-error';
import { FeatureFlag, hasFeature, isLocked } from '../utils/subscription';

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
    // El JWT del Dashboard maestro (platform-auth.middleware.ts) se firma con
    // el mismo secreto pero otra forma: sin esto, un token de plataforma
    // pasaría aquí con `restaurantId` undefined y Prisma lo trataría como
    // "sin filtro", filtrando datos de TODOS los inquilinos.
    if (typeof payload.restaurantId !== 'string' || typeof payload.userId !== 'string') {
      throw new Error('Forma de token inesperada.');
    }
    req.auth = payload;
    // El tenant activo se deriva SIEMPRE del token, nunca del body/params.
    req.restaurantId = payload.restaurantId;
    next();
  } catch {
    throw unauthorized('Token inválido o expirado.');
  }
}

/**
 * Debe montarse DESPUÉS de `authGuard` en la cadena de la ruta.
 * Restringe el acceso a los roles indicados; el resto recibe 403.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw forbidden('No tienes permiso para realizar esta acción.');
    }
    next();
  };
}

/**
 * Corta el acceso al panel si el restaurante está bloqueado (venció
 * `periodEnd` + 12h de gracia sin pago). Nunca se monta en /auth: el login y
 * /auth/me deben seguir funcionando para que el frontend pueda leer el
 * estado y mostrar la pantalla de bloqueo.
 */
function blockIfLocked(req: Request, _res: Response, next: NextFunction) {
  prisma.restaurant
    .findUnique({ where: { id: req.restaurantId }, select: { periodEnd: true, suspended: true } })
    .then((restaurant) => {
      if (restaurant && isLocked(restaurant)) {
        throw new HttpError(403, 'Esta cuenta está bloqueada por falta de pago.', { code: 'ACCOUNT_LOCKED' });
      }
      next();
    })
    .catch(next);
}

/** Cadena estándar para rutas del panel del restaurante: JWT válido + cuenta no bloqueada. */
export const tenantGuard = [authGuard, blockIfLocked];

/**
 * Restringe una ruta al plan Premium exacto. Debe montarse DESPUÉS de `tenantGuard`.
 * Para funciones que Pro también puede tener (o CUSTOM con el adicional
 * contratado), usar `requireFeature` en su lugar.
 */
export function requirePremiumPlan(req: Request, _res: Response, next: NextFunction) {
  prisma.restaurant
    .findUnique({ where: { id: req.restaurantId }, select: { subscriptionPlan: true } })
    .then((restaurant) => {
      if (restaurant?.subscriptionPlan !== 'PREMIUM') {
        throw forbidden('Esta función solo está disponible en el plan Premium.');
      }
      next();
    })
    .catch(next);
}

/**
 * Restringe una ruta a un "feature flag" (Administración, Inventario normal,
 * Inventario por receta, Cuentas por pagar): Premium las trae todas, Pro un
 * subconjunto, y en CUSTOM depende del adicional contratado. Ver hasFeature()
 * en utils/subscription.ts. Debe montarse DESPUÉS de `tenantGuard`.
 */
export function requireFeature(feature: FeatureFlag) {
  return (req: Request, _res: Response, next: NextFunction) => {
    prisma.restaurant
      .findUnique({
        where: { id: req.restaurantId },
        select: {
          subscriptionPlan: true,
          customAdministration: true,
          customInventoryBasic: true,
          customInventoryRecipe: true,
          customAccountsPayable: true,
        },
      })
      .then((restaurant) => {
        if (!restaurant || !hasFeature(restaurant, feature)) {
          throw forbidden('Esta función no está disponible en tu plan actual.');
        }
        next();
      })
      .catch(next);
  };
}
