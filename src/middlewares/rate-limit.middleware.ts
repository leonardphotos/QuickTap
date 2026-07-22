import rateLimit from 'express-rate-limit';

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
