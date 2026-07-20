import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuración central tipada. Falla rápido en arranque si falta algo crítico.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  // URL pública del sitio (para redirects de vuelta desde checkouts externos, ej. Ramblay).
  appUrl: process.env.APP_URL ?? 'https://quicktap.club',

  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // --- Tasa de cambio BCV ---
  // Endpoints JSON que devuelven la tasa oficial del Banco Central de Venezuela.
  // Configurables por si la fuente cambia; por defecto usan dolarapi.com (gratuito, sin API key).
  exchangeRate: {
    usdUrl: process.env.EXCHANGE_RATE_USD_URL ?? 'https://ve.dolarapi.com/v1/dolares/oficial',
    eurUrl: process.env.EXCHANGE_RATE_EUR_URL ?? 'https://ve.dolarapi.com/v1/euros/oficial',
    // Cada cuántas horas se considera "vieja" la tasa cacheada y se reintenta el refresco.
    ttlHours: Number(process.env.EXCHANGE_RATE_TTL_HOURS ?? 6),
  },

  // --- Correo (restablecer contraseña) ---
  // Se envía vía Resend (resend.com) con el dominio quicktap.club verificado,
  // así el correo llega firmado como propio (sin pasar por Gmail). Si falta
  // la API key, el código se imprime en la consola del servidor en vez de
  // enviarse (para poder probar el flujo en desarrollo sin credenciales).
  mail: {
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.MAIL_FROM_EMAIL ?? 'noreply@quicktap.club',
    fromName: process.env.MAIL_FROM_NAME ?? 'QuickTap.club',
  },

  // --- Pasarela de pago Ramblay (C2P / Binance Pay) ---
  // Sin API key configurada, ramblayClient.createPayment() falla con un error
  // claro en vez de tumbar el arranque del servidor (igual que mail.resendApiKey).
  ramblay: {
    apiKey: process.env.RAMBLAY_API_KEY,
    baseUrl: process.env.RAMBLAY_BASE_URL ?? 'https://api.ramblay.com',
    webhookSecret: process.env.RAMBLAY_WEBHOOK_SECRET,
  },
};
