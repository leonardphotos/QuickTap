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
};
