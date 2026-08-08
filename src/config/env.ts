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

const isProd = process.env.NODE_ENV === 'production';

// Sin CORS_ORIGINS configurado, app.ts cae a `origin: true` (refleja cualquier origen) para no
// romper `npm run dev` sin configuración extra. Eso es aceptable en local, pero en producción
// sería aceptar credenciales desde cualquier sitio — mismo criterio de "falla rápido" que
// JWT_SECRET/DATABASE_URL, así nunca queda desplegado por accidente sin restringir el origen.
if (isProd && !process.env.CORS_ORIGINS?.trim()) {
  throw new Error('Falta la variable de entorno requerida en producción: CORS_ORIGINS');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
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

  // --- "Continuar con Google" (login/registro) ---
  // Opcional a propósito (sin required()): no debe romper el arranque si todavía no
  // se configuró. auth.service.ts responde un error claro si falta al llamarlo.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

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

  // --- Microservicio local de IA para fotos de producto (ver ai-photo-service/) ---
  // FastAPI + rembg, corre aparte (no depende de Node). Si no está instalado
  // o está caído, aiPhotoService.ts devuelve un error claro en vez de tumbar
  // la subida de fotos normal (los botones de IA son un extra, no un requisito).
  aiPhotoServiceUrl: process.env.AI_PHOTO_SERVICE_URL ?? 'http://127.0.0.1:8100',

  // --- Pasarela de pago Ramblay (C2P / Binance Pay) ---
  // Sin API key configurada, ramblayClient.createPayment() falla con un error
  // claro en vez de tumbar el arranque del servidor (igual que mail.resendApiKey).
  ramblay: {
    apiKey: process.env.RAMBLAY_API_KEY,
    baseUrl: process.env.RAMBLAY_BASE_URL ?? 'https://api.ramblay.com',
    webhookSecret: process.env.RAMBLAY_WEBHOOK_SECRET,
  },
};
