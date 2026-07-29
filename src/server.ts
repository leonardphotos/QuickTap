import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSockets } from './sockets';
import { prisma } from './config/prisma';
import { exchangeRateService } from './modules/exchange-rate/exchange-rate.service';
import { demoResetService } from './utils/demo-reset.service';
import { demoSimulatorService } from './utils/demo-simulator.service';
import { masterServerStatusService } from './modules/master/master-server-status.service';
import { fiscalInvoicingService } from './modules/fiscal-invoicing/fiscal-invoicing.service';

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

  // Entorno Demo Efímero: barrido de inactividad, red de seguridad del logout
  // explícito — cubre cierres de pestaña forzados/crash que nunca llegan a
  // avisarle al backend. 5 minutos sin actividad = se resetea el demo.
  const DEMO_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
  const DEMO_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
  const demoSweepInterval = setInterval(async () => {
    try {
      const stale = await demoResetService.findStaleDemoRestaurants(DEMO_INACTIVITY_TIMEOUT_MS);
      if (stale.length > 0) await demoResetService.reset();
    } catch {
      // Se reintenta en el próximo barrido.
    }
  }, DEMO_SWEEP_INTERVAL_MS);

  // Entorno Demo Efímero: "movimiento en vivo" — un pedido nuevo (o el avance
  // de uno existente) cada 20s, y consumo de inventario cada 6s, para que el
  // restaurante demo se sienta activo aunque nadie lo esté operando.
  const demoOrderSimInterval = setInterval(() => demoSimulatorService.tickOrder().catch(() => undefined), 20 * 1000);
  const demoInventorySimInterval = setInterval(() => demoSimulatorService.tickInventory().catch(() => undefined), 6 * 1000);

  // Facturación fiscal (SENIAT vía Unidigital): los números de control tardan
  // 1-5 min en asignarse, así que se consultan aparte en vez de esperarlos en
  // el momento del cobro (ver fiscal-invoicing.service.ts -> issueForOrder).
  const fiscalInvoicingPollInterval = setInterval(
    () => fiscalInvoicingService.pollControlNumbers().catch(() => undefined),
    2 * 60 * 1000,
  );

  // Cola de contingencia: reintenta las facturas que no se pudieron emitir por
  // caídas de internet o del API de la imprenta. Es lo que permite que el
  // negocio siga cobrando con la conexión caída sin perder ninguna factura.
  const fiscalInvoicingRetryInterval = setInterval(
    () => fiscalInvoicingService.retryPendingIssues().catch(() => undefined),
    60 * 1000,
  );

  // Dashboard maestro: muestrea RAM/CPU/swap/disco cada minuto para la barra
  // de capacidad del VPS — el promedio sostenido (no el instante) es lo que
  // decide "¿actualizo el plan?" (ver master-server-status.service.ts).
  masterServerStatusService.startSampling();

  // Solo localhost: Nginx (misma máquina) es el único que debe llegar a este
  // puerto — así queda fuera de alcance directo de internet aunque el
  // firewall se desconfigure alguna vez.
  server.listen(env.port, '127.0.0.1', () => {

    console.log(`🚀 QuickTap API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Apagado ordenado.
  const shutdown = async (signal: string) => {

    console.log(`\n${signal} recibido. Cerrando...`);
    clearInterval(refreshInterval);
    clearInterval(demoSweepInterval);
    clearInterval(demoOrderSimInterval);
    clearInterval(demoInventorySimInterval);
    clearInterval(fiscalInvoicingPollInterval);
    clearInterval(fiscalInvoicingRetryInterval);
    masterServerStatusService.stopSampling();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {

  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
