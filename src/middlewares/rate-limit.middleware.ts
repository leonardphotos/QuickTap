import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/** /auth/login, /auth/register: hasta 20 intentos cada 15 min por IP — deja pasar un
 * usuario real que se equivoca de contraseña varias veces, pero frena fuerza bruta. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/forgot-password, /auth/reset-password: más estricto (5 cada 15 min) — ya
 * tienen su propio límite de intentos por código (ver auth.service.ts), esto es
 * la capa de por-IP encima de eso. */
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

/** /auth/verify-lock-pin: el PIN de la pantalla de bloqueo es de solo 4 dígitos (10.000
 * combinaciones) — sin límite, cualquiera con el JWT ya válido (dispositivo compartido, token
 * filtrado) lo fuerza-bruta en segundos. Se limita por usuario (no por IP): el JWT ya identifica
 * a quién, y así no se puede esquivar cambiando de IP mientras se reusa el mismo token. */
export const lockPinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // req.ip crudo rompe la normalización de IPv6 (una misma IP puede escribirse de varias formas
  // válidas) — express-rate-limit trae ipKeyGenerator() justo para eso en el caso de respaldo
  // (no debería usarse casi nunca: esta ruta siempre pasa por authGuard antes, así que req.auth
  // ya viene seteado salvo un bug en otra parte).
  keyGenerator: (req: Request) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});
