import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WAMessage,
  WASocket,
} from '@whiskeysockets/baileys';
import { prisma } from '../../config/prisma';
import { compressImageBuffer, UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { subscriptionPaymentVerificationService } from './subscription-payment-verification.service';
import { currencySymbolFor, platformSettingsService, renderTemplate } from '../platform-settings/platform-settings.service';

/**
 * ============================================================================
 *  Chatbot de WhatsApp de la PLATAFORMA (equipo QuickTap) — no confundir con
 *  whatsapp-bot.service.ts, que es un bot por restaurante.
 * ============================================================================
 *  Mismo mecanismo (WhatsApp Web / multi-dispositivo vía Baileys, QR desde
 *  Ajustes -> WhatsApp del Dashboard maestro), pero UNA sola sesión para toda
 *  la plataforma en vez de una por restaurante — por eso no está keyada por
 *  restaurantId, sino que vive en un único `SessionState` module-level.
 *
 *  Qué manda este bot (ver auth.service.ts y subscription-reminder.service.ts):
 *  - Bienvenida al registrarse un restaurante nuevo.
 *  - Recordatorio de renovación 3 días antes de periodEnd, con el monto y los
 *    datos de pago móvil, más el "responde con la foto del comprobante".
 *  - Reenvía la foto del comprobante al número verificador y, si responde
 *    "Aprobado", renueva el plan solo (ver subscription-payment-verification.service.ts).
 */

export type MasterWhatsappStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected';

interface SessionState {
  status: MasterWhatsappStatus;
  qrDataUrl?: string;
  connectedNumber?: string;
  sock?: WASocket;
  reconnectAttempts: number;
}

const SESSION_ID = 'platform';
const SINGLETON_ID = 'singleton';

let state: SessionState = { status: 'idle', reconnectAttempts: 0 };

/**
 * Tareas que necesitan el bot ya conectado para servir de algo (hoy: el barrido de cobranza).
 *
 * Existe porque conectar con WhatsApp tarda segundos y arrancar el servidor no espera por eso:
 * cualquier envío disparado al arrancar sale antes de que el socket levante y se pierde en
 * silencio, porque sendMessage() devuelve false sin error. Quien registre acá corre en el
 * momento en que el bot está realmente listo.
 *
 * Se guarda acá, en el bot, y lo cablea server.ts: si el bot importara el servicio de cobranza
 * quedaría un ciclo, porque ese ya importa al bot para enviar.
 */
const connectedListeners: (() => void)[] = [];

/** El bot se reconecta solo ante cualquier corte de red, así que esto puede dispararse varias
 * veces seguidas. Los avisos no se duplican (el dedup vive en el propio barrido), pero se deja
 * un margen mínimo para no repetir el trabajo si la conexión queda inestable. */
const CONNECTED_LISTENERS_MIN_GAP_MS = 60 * 1000;
let lastConnectedNotifyAt = 0;

function notifyConnected(): void {
  const now = Date.now();
  if (now - lastConnectedNotifyAt < CONNECTED_LISTENERS_MIN_GAP_MS) return;
  lastConnectedNotifyAt = now;
  for (const listener of connectedListeners) {
    try {
      listener();
    } catch {
      // Un listener roto no puede tumbar la conexión del bot.
    }
  }
}

function sessionDir(): string {
  return path.join(UPLOADS_DIR, 'whatsapp-sessions', SESSION_ID);
}

function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

/**
 * Confirma contra los servidores de WhatsApp si el número existe de verdad, ANTES de intentar
 * mandarle algo. Sin esto, `sock.sendMessage()` a un número mal tecleado o que nunca tuvo
 * WhatsApp no lanza ningún error — la promesa resuelve igual, así que sendMessage() reportaba
 * "enviado" aunque el mensaje nunca hubiera salido de verdad. `onWhatsApp` reutiliza la MISMA
 * conexión ya activa (no abre una sesión nueva, que sí podría desconectar al bot real).
 */
async function checkRegistered(phone: string): Promise<{ exists: boolean; jid: string | null }> {
  if (state.status !== 'connected' || !state.sock) return { exists: false, jid: null };
  try {
    const digits = phone.replace(/\D/g, '');
    const [result] = (await state.sock.onWhatsApp(digits)) ?? [];
    return { exists: !!result?.exists, jid: result?.jid ?? null };
  } catch {
    // Si la propia verificación falla (ej. timeout), no se bloquea el envío por eso — se
    // intenta igual y que el try/catch de sendMessage/sendImage decida.
    return { exists: true, jid: null };
  }
}

/**
 * ----------------------------------------------------------------------------
 *  Cola de envío con espera aleatoria entre mensajes
 * ----------------------------------------------------------------------------
 *  A diferencia del bot por restaurante (1-2 mensajes puntuales por pedido,
 *  volumen bajo por diseño), este bot puede necesitar mandar varios mensajes
 *  seguidos (ej. el barrido de recordatorios de renovación a varios
 *  restaurantes el mismo día) — mandarlos todos de una es exactamente el
 *  patrón que WhatsApp detecta como envío automatizado y puede terminar en un
 *  baneo del número. Todo envío (texto o imagen) pasa por esta cola: se
 *  procesan de a uno, con una espera aleatoria entre ~25 y 35s (30s ± 5s)
 *  entre el fin de un envío y el inicio del siguiente. El primer mensaje de
 *  una cola vacía sale de inmediato, no hace falta esperar sin motivo.
 */
const OUTBOX_MIN_DELAY_MS = 25_000;
const OUTBOX_MAX_DELAY_MS = 35_000;

interface OutboxItem {
  send: () => Promise<boolean>;
  resolve: (sent: boolean) => void;
}

const outbox: OutboxItem[] = [];
let outboxRunning = false;

function randomOutboxDelay(): number {
  return OUTBOX_MIN_DELAY_MS + Math.random() * (OUTBOX_MAX_DELAY_MS - OUTBOX_MIN_DELAY_MS);
}

async function runOutbox(): Promise<void> {
  if (outboxRunning) return;
  outboxRunning = true;
  while (outbox.length > 0) {
    const item = outbox.shift()!;
    const sent = await item.send().catch(() => false);
    item.resolve(sent);
    if (outbox.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, randomOutboxDelay()));
    }
  }
  outboxRunning = false;
}

/**
 * Acuse de recibo de WhatsApp por mensaje enviado.
 *
 * Existe porque `sock.sendMessage()` resolver NO significa que el mensaje se haya entregado:
 * cifra y encola del lado del cliente y devuelve sin error aunque el servidor de WhatsApp
 * nunca lo acepte. Con eso el sistema marcaba cobros como "enviados" que no le llegaron a
 * nadie ni aparecieron en el WhatsApp de la plataforma — perseguimos ese fantasma dos veces
 * (19 y 20/08) creyendo que el problema era cuándo se enviaba.
 *
 * El estado lo emite WhatsApp en `messages.update`: 2 = aceptado por el servidor. Hasta ese
 * número, un envío no cuenta como enviado.
 */
const SERVER_ACK = 2;
/**
 * Tiene que caber dentro del timeout del panel (12s, ver web/src/api/client.ts): el botón
 * "Enviar cobro" espera esta confirmación dentro de la misma petición HTTP, y con una espera
 * más larga el navegador cortaba antes y mostraba un error genérico aunque el envío fuera bien.
 * Un acuse sano llega en menos de un segundo; si tarda más que esto, algo está mal igual.
 */
const ACK_TIMEOUT_MS = 8 * 1000;
const pendingAcks = new Map<string, (acked: boolean) => void>();

function resolveAck(messageId: string): void {
  const resolve = pendingAcks.get(messageId);
  if (!resolve) return;
  pendingAcks.delete(messageId);
  resolve(true);
}

/** Espera el acuse del servidor. Si no llega a tiempo, el envío se da por fallido: es
 * preferible reintentar en el próximo barrido —y a lo sumo repetir un aviso— antes que dar por
 * cobrado a alguien que nunca recibió nada. */
function waitForServerAck(messageId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(messageId);
      resolve(false);
    }, ACK_TIMEOUT_MS);
    pendingAcks.set(messageId, (acked) => {
      clearTimeout(timer);
      resolve(acked);
    });
  });
}

function enqueueOutbox(send: () => Promise<boolean>): Promise<boolean> {
  return new Promise((resolve) => {
    outbox.push({ send, resolve });
    runOutbox().catch(() => undefined);
  });
}

export const masterWhatsappBotService = {
  getStatus() {
    return { status: state.status, qrDataUrl: state.qrDataUrl ?? null, connectedNumber: state.connectedNumber ?? null };
  },

  /** Registra algo para que corra cuando el bot quede conectado — y también si ya lo está, para
   * que no dependa de haberse suscrito antes de que ocurriera la conexión. */
  onConnected(listener: () => void): void {
    connectedListeners.push(listener);
    if (state.status === 'connected') listener();
  },

  /** Arranca (o reutiliza) la sesión única de la plataforma. Igual patrón que
   * whatsapp-bot.service.ts -> connect(), sin el parámetro restaurantId. */
  async connect(): Promise<void> {
    if (state.status === 'connected' || state.status === 'connecting' || state.status === 'qr') return;

    const dir = sessionDir();
    fs.mkdirSync(dir, { recursive: true });

    state.status = 'connecting';
    state.qrDataUrl = undefined;

    const { state: authState, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      logger: pino({ level: 'silent' }),
      browser: ['QuickTap', 'Chrome', '1.0'],
    });
    state.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    // Confirmación real de que WhatsApp aceptó cada mensaje (ver waitForServerAck arriba).
    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const id = u.key?.id;
        const status = u.update?.status;
        if (id && typeof status === 'number' && status >= SERVER_ACK) resolveAck(id);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        this.handleIncomingMessage(msg).catch(() => undefined);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.status = 'qr';
        state.qrDataUrl = await QRCode.toDataURL(qr);
      }

      if (connection === 'open') {
        state.status = 'connected';
        state.qrDataUrl = undefined;
        state.reconnectAttempts = 0;
        const rawNumber = sock.user?.phoneNumber ?? sock.user?.id?.split(/[:@]/)[0] ?? null;
        state.connectedNumber = rawNumber ? `+${rawNumber.replace(/\D/g, '')}` : undefined;
        await prisma.platformSettings
          .upsert({
            where: { id: SINGLETON_ID },
            create: { id: SINGLETON_ID, masterWhatsappEnabled: true, masterWhatsappConnectedNumber: state.connectedNumber ?? null },
            update: { masterWhatsappConnectedNumber: state.connectedNumber ?? null },
          })
          .catch(() => undefined);

        // Recién ahora sendMessage() puede entregar de verdad (ver notifyConnected arriba).
        notifyConnected();
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          await this.forgetSession();
          return;
        }

        const attempts = (state.reconnectAttempts ?? 0) + 1;
        if (attempts <= 5) {
          state.reconnectAttempts = attempts;
          state.status = 'disconnected';
          setTimeout(() => this.connect().catch(() => undefined), Math.min(attempts * 3000, 15000));
        } else {
          state.status = 'disconnected';
        }
      }
    });
  },

  /** Mensaje entrante: solo interesan dos casos (verificador respondiendo, o una foto de
   * comprobante) — a diferencia del bot por restaurante, este NO manda saludo de bienvenida a
   * cualquiera que escriba (sería raro que un desconocido le escriba al WhatsApp de QuickTap y
   * reciba una respuesta automática de "bienvenido a tu restaurante"). */
  async handleIncomingMessage(msg: WAMessage): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;
    const phoneJid = msg.key.remoteJidAlt || jid;
    const phoneDigits = phoneJid.replace(/@.*/, '');

    const settings = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { subscriptionVerifierPhone: true },
    });

    const content = extractMessageContent(msg.message) ?? msg.message;

    if (settings?.subscriptionVerifierPhone && settings.subscriptionVerifierPhone.replace(/\D/g, '') === phoneDigits) {
      const text = content.conversation ?? content.extendedTextMessage?.text;
      if (text) await this.routeVerifierReply(text);
      return;
    }

    if (content.imageMessage) {
      await this.routeIncomingProofImage(phoneDigits, msg);
      return;
    }
    // Cualquier otro mensaje (texto normal de alguien que no está en un flujo abierto) se
    // ignora en silencio — este bot no tiene un saludo genérico.
  },

  async routeIncomingProofImage(phoneDigits: string, msg: WAMessage): Promise<void> {
    const match = await subscriptionPaymentVerificationService.matchAwaitingProof(phoneDigits);
    if (!match) return;
    if (state.status !== 'connected' || !state.sock) return;

    let buffer: Buffer;
    try {
      buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
    } catch (err) {
      console.error('[master-whatsapp] no se pudo descargar el comprobante de renovación:', err);
      return;
    }

    const dir = path.join(UPLOADS_DIR, 'subscription-payment-proofs');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    buffer = await compressImageBuffer(buffer); // comprobante: 1200px q80, no llena el disco
    fs.writeFileSync(path.join(dir, filename), buffer);
    const proofImageUrl = `/uploads/subscription-payment-proofs/${filename}`;

    const { shouldForwardNow } = await subscriptionPaymentVerificationService.recordProofImage(match.id, proofImageUrl);

    if (shouldForwardNow) {
      const settings = await prisma.platformSettings.findUnique({
        where: { id: SINGLETON_ID },
        select: { subscriptionVerifierPhone: true },
      });
      const restaurant = await prisma.restaurant.findUnique({ where: { id: match.restaurantId }, select: { name: true } });
      if (settings?.subscriptionVerifierPhone && restaurant) {
        const symbol = currencySymbolFor(await platformSettingsService.getSubscriptionCurrency());
        await this.sendImage(settings.subscriptionVerifierPhone, buffer, buildVerifierCaption(restaurant.name, match, symbol));
      }
    }

    const templates = await platformSettingsService.getMessageTemplates();
    await this.sendMessage(phoneDigits, renderTemplate(templates.proofReceivedMessage, {}));
  },

  async routeVerifierReply(text: string): Promise<void> {
    const result = await subscriptionPaymentVerificationService.resolveVerifierReply(text);
    if (result.action === 'ignore' || !result.verification) return;

    const templates = await platformSettingsService.getMessageTemplates();
    if (result.action === 'approve') {
      const { ownerPhone, restaurant } = await subscriptionPaymentVerificationService.approve(result.verification.id);
      const periodEndLabel = restaurant.periodEnd.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
      await this.sendMessage(ownerPhone, renderTemplate(templates.paymentApprovedMessage, { periodEndLabel }));
    } else {
      const { ownerPhone } = await subscriptionPaymentVerificationService.reject(result.verification.id);
      await this.sendMessage(ownerPhone, renderTemplate(templates.paymentRejectedMessage, {}));
    }
    await this.advanceQueue();
  },

  /** Tras resolver una verificación, reenvía al verificador la siguiente que estaba en cola. */
  async advanceQueue(): Promise<void> {
    const next = await subscriptionPaymentVerificationService.dequeueNext();
    if (!next) return;
    const settings = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { subscriptionVerifierPhone: true },
    });
    if (!settings?.subscriptionVerifierPhone || !next.proofImageUrl) return;
    const restaurant = await prisma.restaurant.findUnique({ where: { id: next.restaurantId }, select: { name: true } });
    if (!restaurant) return;
    const imagePath = path.join(process.cwd(), next.proofImageUrl.replace(/^\//, ''));
    const buffer = await fs.promises.readFile(imagePath).catch(() => null);
    if (!buffer) return;
    const symbol = currencySymbolFor(await platformSettingsService.getSubscriptionCurrency());
    await this.sendImage(settings.subscriptionVerifierPhone, buffer, buildVerifierCaption(restaurant.name, next, symbol));
  },

  async disconnect(): Promise<void> {
    if (state.sock) await state.sock.logout().catch(() => undefined);
    await this.forgetSession();
  },

  async forgetSession(): Promise<void> {
    state = { status: 'disconnected', reconnectAttempts: 0 };
    await fs.promises.rm(sessionDir(), { recursive: true, force: true }).catch(() => undefined);
    await prisma.platformSettings
      .upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, masterWhatsappEnabled: false, masterWhatsappConnectedNumber: null },
        update: { masterWhatsappEnabled: false, masterWhatsappConnectedNumber: null },
      })
      .catch(() => undefined);
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, masterWhatsappEnabled: enabled },
      update: { masterWhatsappEnabled: enabled },
    });
  },

  async updateVerifierPhone(phone: string | null): Promise<void> {
    await prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, subscriptionVerifierPhone: phone },
      update: { subscriptionVerifierPhone: phone },
    });
  },

  /** Manda un mensaje de texto libre. Silencioso si el bot no está conectado — nunca debe
   * tumbar el registro de un restaurante ni el barrido de recordatorios. Encolado (ver
   * enqueueOutbox arriba): si hay otros mensajes esperando, este espera su turno con un
   * intervalo aleatorio de ~30s para no parecer envío masivo automatizado. */
  async sendMessage(phone: string | null | undefined, message: string): Promise<boolean> {
    if (!phone) return false;
    return enqueueOutbox(async () => {
      if (state.status !== 'connected' || !state.sock) return false;
      const { exists, jid } = await checkRegistered(phone);
      if (!exists) return false;
      try {
        const result = await state.sock.sendMessage(jid ?? toJid(phone), { text: message });
        // Sin id no hay forma de confirmar nada, así que no se puede dar por enviado.
        const messageId = result?.key?.id;
        if (!messageId) return false;
        return await waitForServerAck(messageId);
      } catch {
        return false;
      }
    });
  },

  /** Solo para depuración desde el Dashboard maestro: confirma si un número existe en
   * WhatsApp sin mandarle nada. */
  async checkRegistered(phone: string): Promise<{ exists: boolean; jid: string | null }> {
    return checkRegistered(phone);
  },

  /** Encola un mismo mensaje para varios números de una sola vez — ej. un anuncio a todos los
   * restaurantes. No espera a que termine: cada envío pasa por la misma cola de sendMessage()
   * (uno a la vez, ~30s aleatorios entre cada uno), así que el llamador no tiene que ir
   * disparando uno por uno con esperas manuales — la cola se procesa sola en segundo plano. */
  broadcast(phones: string[], message: string): void {
    for (const phone of phones) {
      this.sendMessage(phone, message).catch(() => undefined);
    }
  },

  async sendImage(phone: string | null | undefined, image: Buffer, caption?: string): Promise<boolean> {
    if (!phone) return false;
    return enqueueOutbox(async () => {
      if (state.status !== 'connected' || !state.sock) return false;
      const { exists, jid } = await checkRegistered(phone);
      if (!exists) return false;
      try {
        await state.sock.sendMessage(jid ?? toJid(phone), { image, caption });
        return true;
      } catch {
        return false;
      }
    });
  },

  /** Al arrancar el servidor: reconecta la sesión de plataforma si ya estaba vinculada
   * (mismo criterio que whatsapp-bot.service.ts -> reconnectEnabledSessions). */
  async reconnectIfEnabled(): Promise<void> {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { masterWhatsappEnabled: true },
    });
    if (settings?.masterWhatsappEnabled && fs.existsSync(sessionDir())) {
      this.connect().catch(() => undefined);
    }
  },
};

function buildVerifierCaption(
  restaurantName: string,
  verification: { plan: string; billingCycle: string; amountUsd: unknown },
  symbol: string,
): string {
  const amount = verification.amountUsd != null ? `${symbol}${Number(verification.amountUsd).toFixed(2)}` : 'monto acordado';
  return [
    `📄 Comprobante de renovación — ${restaurantName}`,
    `📦 Plan: ${verification.plan} (${verification.billingCycle})`,
    `💰 Monto: ${amount}`,
    '',
    'Responde *Aprobado* o *Rechazado*.',
  ].join('\n');
}
