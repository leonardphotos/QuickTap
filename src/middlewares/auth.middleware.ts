import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { BusinessType } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { forbidden, HttpError, unauthorized } from '../utils/http-error';
import { FeatureFlag, hasFeature, isLockedAsync } from '../utils/subscription';
import { FULL_ACCESS_ROLES } from '../utils/roles';

/**
 * Payload del JWT. Lleva SIEMPRE el `restaurantId` para forzar el aislamiento
 * multi-inquilino en cada request autenticada.
 */
export interface AuthPayload {
  userId: string;
  restaurantId: string;
  role: string;
  // Presente solo en el token de una sucursal: el restaurantId de su sede
  // principal (ver src/modules/branches/). Permite "volver a sede principal"
  // sin tener que resolverlo con otra consulta.
  parentRestaurantId?: string;
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
    .findUnique({
      where: { id: req.restaurantId },
      select: { periodEnd: true, suspended: true, parentRestaurantId: true, isDemo: true },
    })
    .then(async (restaurant) => {
      if (restaurant && (await isLockedAsync(restaurant))) {
        throw new HttpError(403, 'Esta cuenta está bloqueada por falta de pago.', { code: 'ACCOUNT_LOCKED' });
      }
      // Entorno Demo Efímero: cada request autenticado cuenta como "sigue en uso" —
      // fire-and-forget, no bloquea la respuesta. El barrido de inactividad
      // (server.ts) resetea el demo cuando esto queda viejo (pestaña cerrada).
      if (restaurant?.isDemo) {
        prisma.restaurant.update({ where: { id: req.restaurantId }, data: { demoLastActivityAt: new Date() } }).catch(() => undefined);
      }
      next();
    })
    .catch(next);
}

/** Cadena estándar para rutas del panel del restaurante: JWT válido + cuenta no bloqueada. */
export const tenantGuard = [authGuard, blockIfLocked];

/**
 * Inventario para roles restringidos (Mesero/Cocina/Cajero sin acceso completo): los de acceso
 * total (OWNER/ADMIN/STAFF) siempre pasan; el resto necesita el permiso individual
 * `canAccessInventory` otorgado desde Ajustes → Equipo (un Cajero con `cashierFullAccess` pasa
 * igual, por eso ese flag también cuenta acá — ver `requireRoleOrCashierFullAccess`).
 * Debe montarse DESPUÉS de `tenantGuard`.
 */
export function requireInventoryAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.auth && (FULL_ACCESS_ROLES as readonly string[]).includes(req.auth.role)) {
    next();
    return;
  }
  prisma.user
    .findUnique({ where: { id: req.auth?.userId }, select: { canAccessInventory: true, cashierFullAccess: true } })
    .then((user) => {
      if (!user?.canAccessInventory && !user?.cashierFullAccess) {
        throw forbidden('No tienes acceso a Inventario.');
      }
      next();
    })
    .catch(next);
}

/**
 * Igual que `requireRole`, pero un Cajero con `User.cashierFullAccess` (otorgado individualmente
 * desde Ajustes → Equipo, mismo patrón que `requireInventoryAccess`) pasa igual que si tuviera
 * uno de los `roles` indicados. Por defecto un Cajero YA NO está en ADMIN_CASHIER_ROLES/
 * FULL_ACCESS_ROLES (tiene el mismo acceso que Mesero) — este flag es la forma de devolverle el
 * acceso completo de antes en las rutas que antes lo incluían. Debe montarse DESPUÉS de `tenantGuard`.
 */
export function requireRoleOrCashierFullAccess(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(forbidden('No tienes permiso para realizar esta acción.'));
      return;
    }
    if (roles.includes(req.auth.role)) {
      next();
      return;
    }
    if (req.auth.role !== 'CASHIER') {
      next(forbidden('No tienes permiso para realizar esta acción.'));
      return;
    }
    prisma.user
      .findUnique({ where: { id: req.auth.userId }, select: { cashierFullAccess: true } })
      .then((user) => {
        if (!user?.cashierFullAccess) {
          throw forbidden('No tienes permiso para realizar esta acción.');
        }
        next();
      })
      .catch(next);
  };
}

/**
 * Misma regla que `requireRoleOrCashierFullAccess` pero como pregunta, no como bloqueo: sirve
 * para rutas que TODOS pueden llamar pero que devuelven menos datos a quien tiene menos acceso
 * (ej. el mesero ve las reservas confirmadas, no las que están por aceptar).
 */
export async function hasRoleOrCashierFullAccess(req: Request, ...roles: string[]): Promise<boolean> {
  if (!req.auth) return false;
  if (roles.includes(req.auth.role)) return true;
  if (req.auth.role !== 'CASHIER') return false;
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { cashierFullAccess: true } });
  return !!user?.cashierFullAccess;
}

/**
 * Entorno Demo Efímero: bloquea por completo una ruta cuando el restaurante
 * es la cuenta demo (ej. "Eliminar" en Equipo) — cualquier otro cambio se
 * deshace solo al resetearse, así que no hace falta bloquearlo también.
 */
export function blockIfDemo(req: Request, _res: Response, next: NextFunction) {
  prisma.restaurant
    .findUnique({ where: { id: req.restaurantId }, select: { isDemo: true } })
    .then((restaurant) => {
      if (restaurant?.isDemo) {
        throw forbidden('No disponible en el entorno demo.');
      }
      next();
    })
    .catch(next);
}

/** Igual que `blockIfDemo`, pero solo si el body trae `role` — deja pasar el resto de un PATCH sin tocar. */
export function blockIfDemoRoleChange(req: Request, res: Response, next: NextFunction) {
  if (req.body?.role === undefined) {
    next();
    return;
  }
  blockIfDemo(req, res, next);
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
          legacyFullAccessUntil: true,
        },
      })
      .then((restaurant) => {
        if (!restaurant) {
          // El restaurante de esta sesión ya no existe — típico del Entorno Demo Efímero
          // (el barrido de inactividad borra y recrea el demo con otro id mientras la
          // pestaña seguía abierta). No es un límite de plan sino una sesión inválida:
          // 401 para que el interceptor del frontend limpie el token viejo.
          throw unauthorized('Tu sesión expiró. Vuelve a iniciar sesión.');
        }
        if (!hasFeature(restaurant, feature)) {
          throw forbidden('Esta función no está disponible en tu plan actual.');
        }
        next();
      })
      .catch(next);
  };
}

/**
 * Restringe una ruta a un vertical de negocio. Debe montarse DESPUÉS de `tenantGuard`.
 *
 * No es una barrera de seguridad entre inquilinos —el `restaurantId` siempre sale del
 * token, así que un restaurante que llame a estas rutas solo vería sus propios datos
 * (vacíos)—, sino de higiene: evita que un panel equivocado escriba en tablas de otro
 * vertical y deja el error claro en vez de un 200 sin sentido.
 */
export function requireBusinessType(...types: BusinessType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    prisma.restaurant
      .findUnique({ where: { id: req.restaurantId }, select: { businessType: true } })
      .then((restaurant) => {
        if (!restaurant || !types.includes(restaurant.businessType)) {
          throw forbidden('Esta sección no corresponde a tu tipo de negocio.');
        }
        next();
      })
      .catch(next);
  };
}
