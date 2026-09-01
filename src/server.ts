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
import { CHATBOTS_ENABLED } from './config/features';
import { whatsappBotService } from './modules/whatsapp-bot/whatsapp-bot.service';
import { orderPaymentVerificationService } from './modules/orders/order-payment-verification.service';
import { masterWhatsappBotService } from './modules/master-whatsapp/master-whatsapp-bot.service';
import { subscriptionReminderService } from './modules/master-whatsapp/subscription-reminder.service';
import { clubDebtBotService } from './modules/club/club-debt-bot.service';
import { subscriptionPaymentVerificationService } from './modules/master-whatsapp/subscription-payment-verification.service';
import { walletService } from './modules/wallet/wallet.service';
import { shopInstallmentsService } from './modules/shop/shop-installments.service';
import { emitToKitchen, SocketEvents } from './sockets';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // WebSockets (cola de cocina en tiempo real).
  initSockets(server);

  // Chatbot de WhatsApp: reconecta las sesiones ya vinculadas (el reinicio nocturno de PM2,
  // ver ecosystem.config.js, no debe forzar a cada restaurante a escanear el QR de nuevo).
  // Apagados por CHATBOTS_ENABLED (ver config/features.ts): sin esto se reconectarían sesiones
  // que no pueden entregar mensajes.
  if (CHATBOTS_ENABLED) {
    whatsappBotService.reconnectEnabledSessions().catch(() => undefined);

    // Chatbot de WhatsApp de la plataforma (bienvenida + recordatorios de renovación, ver
    // src/modules/master-whatsapp/): misma lógica de reconexión que el bot por restaurante.
    masterWhatsappBotService.reconnectIfEnabled().catch(() => undefined);
  }

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

  // Chatbot de WhatsApp: si el verificador de un pago no responde "Aprobado"/"Rechazado" en
  // 20 min, se marca vencido y se avisa por socket al panel (no por WhatsApp — insistirle al
  // mismo verificador que ya no respondió no llega a nadie nuevo) para que el staff revise el
  // pago a mano. Ver order-payment-verification.service.ts.
  const PAYMENT_VERIFICATION_TIMEOUT_MS = 20 * 60 * 1000;
  const paymentVerificationSweepInterval = setInterval(async () => {
    try {
      const timedOut = await orderPaymentVerificationService.sweepTimeouts(PAYMENT_VERIFICATION_TIMEOUT_MS);
      for (const t of timedOut) {
        emitToKitchen(t.restaurantId, SocketEvents.PAYMENT_VERIFICATION_TIMEOUT, { orderId: t.orderId });
        await whatsappBotService.advanceQueue(t.restaurantId).catch(() => undefined);
      }
    } catch {
      // Se reintenta en el próximo barrido.
    }
  }, 2 * 60 * 1000);

  // Chatbot de WhatsApp de la plataforma: recordatorio de renovación 3 días antes de
  // periodEnd (ver subscription-reminder.service.ts). Corre cada 6h + una pasada al arrancar
  // (mismo criterio que la tasa BCV) — el dedup por `subscriptionReminderForPeriodEnd` evita
  // reenviarlo en cada tick mientras el restaurante siga sin renovar.
  // El barrido se engancha a la conexión del bot en vez de correr al arrancar: conectar con
  // WhatsApp tarda segundos y el arranque no espera por eso, así que la pasada inicial salía
  // siempre con el socket abajo y sendMessage() devolvía false sin error. El recordatorio no se
  // marcaba (bien) pero quedaba a la espera del tick de 6h, y ese contador se reinicia con cada
  // despliegue y con el reinicio nocturno de PM2 — en la práctica casi nunca llegaba a correr
  // con el bot arriba, y el cobro no salía.
  //
  // Y no basta con esperar el evento de conexión: `connection: 'open'` llega antes de que la
  // sesión termine de inicializarse (subida de pre-keys, sincronización de estado). Un mensaje
  // enviado en esa ventana se cifra y WhatsApp lo acepta —sendMessage() devuelve true— pero
  // nunca se propaga: no le llega al destinatario ni aparece en el WhatsApp de la plataforma.
  // Se comprobó en el envío del 20/08: el mensaje salió 08:03:42 y las pre-keys de arranque se
  // subieron 08:04:40, un minuto DESPUÉS. Por eso se deja asentar la conexión, mismo criterio
  // que el bot de deudas de clubes acá abajo.
  const REMINDER_SETTLE_AFTER_CONNECT_MS = 3 * 60 * 1000;
  if (CHATBOTS_ENABLED) {
    masterWhatsappBotService.onConnected(() => {
      setTimeout(() => subscriptionReminderService.checkExpiring().catch(() => undefined), REMINDER_SETTLE_AFTER_CONNECT_MS);
    });
  }
  const subscriptionReminderInterval = CHATBOTS_ENABLED
    ? setInterval(() => subscriptionReminderService.checkExpiring().catch(() => undefined), 6 * 60 * 60 * 1000)
    : null;

  // Cobranza de deudas de clubes por WhatsApp: recordatorio a los 3 días de la deuda,
  // repetido cada 7 (dedup en ClubDebtReminder) — ver club-debt-bot.service.ts. Cada 6h,
  // con una primera pasada diferida para dar tiempo a que las sesiones del bot reconecten.
  const clubDebtReminderKickoff = CHATBOTS_ENABLED
    ? setTimeout(() => clubDebtBotService.sweepReminders().catch(() => undefined), 3 * 60 * 1000)
    : null;
  const clubDebtReminderInterval = CHATBOTS_ENABLED
    ? setInterval(() => clubDebtBotService.sweepReminders().catch(() => undefined), 6 * 60 * 60 * 1000)
    : null;

  // Mismo barrido de vencidos que orderPaymentVerificationService, pero para comprobantes de
  // RENOVACIÓN de plan (ver subscription-payment-verification.service.ts).
  const SUBSCRIPTION_VERIFICATION_TIMEOUT_MS = 20 * 60 * 1000;
  const subscriptionVerificationSweepInterval = setInterval(async () => {
    try {
      const timedOut = await subscriptionPaymentVerificationService.sweepTimeouts(SUBSCRIPTION_VERIFICATION_TIMEOUT_MS);
      if (timedOut.length > 0) await masterWhatsappBotService.advanceQueue().catch(() => undefined);
    } catch {
      // Se reintenta en el próximo barrido.
    }
  }, 2 * 60 * 1000);

  // QuickTap Wallet / cuotas de locales comerciales: aplica la mora a las cuotas que ya
  // vencieron y siguen sin pagar (ver shop-installments.service.ts -> aplicarMoraVencidas).
  // Existía la función pero nada la llamaba — ninguna cuota vencida terminaba con mora
  // aplicada por más días que pasaran. Una pasada al arrancar + cada 6h, mismo criterio que
  // el resto de los barridos de esta lista.
  shopInstallmentsService.aplicarMoraVencidas().catch(() => undefined);
  const installmentLateFeeInterval = setInterval(
    () => shopInstallmentsService.aplicarMoraVencidas().catch(() => undefined),
    6 * 60 * 60 * 1000,
  );

  // Recordatorio de cuotas al Wallet: push 3 días antes del vencimiento. Mismo ritmo que la
  // mora; el servicio sella cada cuota avisada, así que repetir el barrido no repite el aviso.
  walletService.recordatoriosDeCuotas().catch(() => undefined);
  const walletReminderInterval = setInterval(
    () => walletService.recordatoriosDeCuotas().catch(() => undefined),
    6 * 60 * 60 * 1000,
  );

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
    clearInterval(paymentVerificationSweepInterval);
    if (subscriptionReminderInterval) clearInterval(subscriptionReminderInterval);
    if (clubDebtReminderKickoff) clearTimeout(clubDebtReminderKickoff);
    if (clubDebtReminderInterval) clearInterval(clubDebtReminderInterval);
    clearInterval(subscriptionVerificationSweepInterval);
    clearInterval(installmentLateFeeInterval);
    clearInterval(walletReminderInterval);
    masterServerStatusService.stopSampling();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Red de seguridad: todo el código de rutas ya pasa por asyncHandler (captura y responde 500
// sin tumbar el proceso), y los intervalos de arriba ya van con .catch(() => undefined) cada
// uno. Esto es para lo que se escape de ambos (una librería de terceros, un socket handler, un
// callback suelto). El proceso igual termina — después de un error no capturado el estado de
// la app ya no es confiable como para seguir sirviendo tráfico — pero deja constancia clara en
// logs/error.log (PM2 lo reinicia solo, ver ecosystem.config.js) en vez de que el único rastro
// quede enterrado en dmesg/journalctl como pasó con el OOM del 26/08.
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});

bootstrap().catch((err) => {

  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
