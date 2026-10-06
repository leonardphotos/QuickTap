import { sendPendingPaymentNotes } from './modules/subscription-receipts/payment-note.service';
import { runAutomaticBillingSms } from './modules/billing-notices/billing-notice.automatic';
import { walletSmsReminders } from './modules/wallet/wallet-sms-reminders.service';
import http from 'http';
import { registrationFunnelService } from './modules/registration-funnel/registration-funnel.service';
import { masterRecurringExpensesService } from './modules/master/master-recurring-expenses.service';
import { generateWeeklyReports } from './modules/reports/weekly.service';
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
import { membershipVerificationService } from './modules/plan-requests/membership-verification.service';
setInterval(() => membershipVerificationService.sweep().catch(console.error), 60000).unref();
import { clubDebtBotService } from './modules/club/club-debt-bot.service';
import { subscriptionPaymentVerificationService } from './modules/master-whatsapp/subscription-payment-verification.service';
import { walletService } from './modules/wallet/wallet.service';
import { shopInstallmentsService } from './modules/shop/shop-installments.service';
import { emitToKitchen, SocketEvents } from './sockets';

async function bootstrap() {
  const paymentNotesSweep = () => sendPendingPaymentNotes().catch(() => console.error('No se pudo revisar la cola de notas de pago.'));
  void paymentNotesSweep();
  setInterval(paymentNotesSweep, 60 * 1000).unref();
  const app = createApp();
  const purgeRegistrationMetrics = () => registrationFunnelService.purgeExpired().catch(() => console.error('No se pudo ejecutar la limpieza de métricas de registro.'));
  void purgeRegistrationMetrics();
  setInterval(purgeRegistrationMetrics, 24 * 60 * 60 * 1000).unref();
  const server = http.createServer(app);

  // WebSockets (cola de cocina en tiempo real).
  initSockets(server);
  const recurringSweep = () => masterRecurringExpensesService.sweep().catch(error => console.error('Gastos recurrentes del Máster:', error.message));
  void recurringSweep();
  setInterval(recurringSweep, 60 * 1000).unref();
  // Persistido e idempotente: recupera lunes pendientes tras reinicios o caídas.
  const weeklySweep = () => generateWeeklyReports().catch(error => console.error('Reporte semanal:', error.message));
  void weeklySweep();
  setInterval(weeklySweep, 60 * 1000).unref();

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

  // Tasa BCV: refresco inicial (best-effort, no bloquea el arranque si falla).
  exchangeRateService.refreshAll().catch(() => undefined);

  // Programación fija para las 4:00 PM (hora de Venezuela, America/Caracas):
  // Es la hora oficial en que el BCV publica las tasas del cierre de mesas cambiarias.
  function scheduleNext4pmCaracas() {
    // Calculamos el próximo 16:00 en zona horaria America/Caracas (UTC-4)
    const now = new Date();
    // Offset fijo de Venezuela: UTC-4
    const VET_OFFSET_HOURS = -4;
    const nowUtcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const nowVet = new Date(nowUtcMs + VET_OFFSET_HOURS * 60 * 60 * 1000);

    const targetVet = new Date(nowVet);
    targetVet.setHours(16, 0, 0, 0);

    // Si ya pasaron las 4:00 PM hoy en Venezuela, programar para mañana a las 4:00 PM
    if (nowVet.getTime() >= targetVet.getTime()) {
      targetVet.setDate(targetVet.getDate() + 1);
    }

    const delayMs = targetVet.getTime() - nowVet.getTime();

    return setTimeout(async () => {
      console.info('[exchange-rate] Ejecutando actualización programada de las 4:00 PM VET (BCV)...');
      await exchangeRateService.refreshAll().catch((err) =>
        console.error('[exchange-rate] Error en refresco de las 4 PM:', err)
      );
      // Reintentos escalonados a las 4:15 PM y 4:30 PM por si el BCV tarda unos minutos en publicar
      setTimeout(() => exchangeRateService.refreshAll().catch(() => undefined), 15 * 60 * 1000);
      setTimeout(() => exchangeRateService.refreshAll().catch(() => undefined), 30 * 60 * 1000);

      // Programar para el día siguiente
      bcvDailyTimeout = scheduleNext4pmCaracas();
    }, delayMs);
  }

  let bcvDailyTimeout = scheduleNext4pmCaracas();

  // Monitoreo periódico de respaldo cada 2 horas por si el portal cambia fuera de hora
  const refreshInterval = setInterval(
    () => exchangeRateService.refreshAll().catch(() => undefined),
    2 * 60 * 60 * 1000,
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

  // Cobranza por el WhatsApp del Máster (Evolution), independiente de los bots antiguos.
  // Revisa cada hora y al arrancar; el servicio conserva el aviso por período.
  const runSubscriptionReminders = () => subscriptionReminderService.checkExpiring()
    .then(({ sent }) => console.info('[subscription-reminders] Barrido completado', { sent }))
    .catch((error) => console.error('[subscription-reminders] Falló el barrido', error));
  // Avisos SMS diarios: desde dos días antes; deduplicación persistente por local/día.
  const runBillingSms = () => runAutomaticBillingSms()
    .then(result => { if(result.accepted || result.errors) console.info('[billing-sms]', result); })
    .catch(() => console.error('[billing-sms] No se pudo completar el barrido.'));
  const billingSmsKickoff = setTimeout(runBillingSms, 60_000);
  const billingSmsInterval = setInterval(runBillingSms, 15 * 60 * 1000);
  const subscriptionReminderKickoff = setTimeout(runSubscriptionReminders, 60_000);
  const subscriptionReminderInterval = setInterval(runSubscriptionReminders, 60 * 60 * 1000);

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

  // SMS dos días calendario antes, independiente de las notificaciones push.
  const runWalletSmsReminders = () => walletSmsReminders.run().catch(() => {
    console.error('[wallet-sms] Falló el barrido de recordatorios.');
  });
  runWalletSmsReminders();
  const walletSmsReminderInterval = setInterval(runWalletSmsReminders, 60 * 60 * 1000);

  // Solo localhost: Nginx (misma máquina) es el único que debe llegar a este
  // puerto — así queda fuera de alcance directo de internet aunque el
  // firewall se desconfigure alguna vez.
  server.listen(env.port, '127.0.0.1', () => {

    console.log(`🚀 QuickTap API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Apagado ordenado.
  const shutdown = async (signal: string) => {

    console.log(`\n${signal} recibido. Cerrando...`);
    clearTimeout(bcvDailyTimeout);
    clearInterval(refreshInterval);
    clearInterval(demoSweepInterval);
    clearInterval(demoOrderSimInterval);
    clearInterval(demoInventorySimInterval);
    clearInterval(fiscalInvoicingPollInterval);
    clearInterval(fiscalInvoicingRetryInterval);
    clearInterval(paymentVerificationSweepInterval);
    clearTimeout(billingSmsKickoff);
    clearInterval(billingSmsInterval);
    clearTimeout(subscriptionReminderKickoff);
    clearInterval(subscriptionReminderInterval);
    if (clubDebtReminderKickoff) clearTimeout(clubDebtReminderKickoff);
    if (clubDebtReminderInterval) clearInterval(clubDebtReminderInterval);
    clearInterval(subscriptionVerificationSweepInterval);
    clearInterval(installmentLateFeeInterval);
    clearInterval(walletReminderInterval);
    clearInterval(walletSmsReminderInterval);
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
