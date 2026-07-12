import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSockets } from './sockets';
import { prisma } from './config/prisma';
import { exchangeRateService } from './modules/exchange-rate/exchange-rate.service';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // WebSockets (cola de cocina en tiempo real).
  initSockets(server);

  // Tasa BCV: refresco inicial (best-effort, no bloquea el arranque si falla)
  // + refresco periódico según EXCHANGE_RATE_TTL_HOURS.
  exchangeRateService.refreshAll().catch(() => undefined);
  const refreshInterval = setInterval(
    () => exchangeRateService.refreshAll().catch(() => undefined),
    env.exchangeRate.ttlHours * 60 * 60 * 1000,
  );

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 QuickTap API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Apagado ordenado.
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} recibido. Cerrando...`);
    clearInterval(refreshInterval);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
