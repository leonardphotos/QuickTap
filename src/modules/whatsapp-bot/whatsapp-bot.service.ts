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
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { compressImageBuffer, UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { emitToKitchen, SocketEvents } from '../../sockets';
import {
  formatVenezuelanWhatsappPhone,
  PAYMENT_LABELS,
  renderWhatsappTemplate,
  toInternationalWhatsappDigits,
} from '../../utils/whatsapp';
import { UpdateWhatsappBotSettingsInput } from './whatsapp-bot.dto';
import { orderPaymentVerificationService } from '../orders/order-payment-verification.service';
import { clubDebtBotService } from '../club/club-debt-bot.service';
import { CURRENCY_SYMBOLS, formatBs, formatMoney } from '../../utils/money';

/**
 * ============================================================================
 *  Chatbot de WhatsApp — vinculado por código QR (protocolo WhatsApp Web /
 *  multi-dispositivo, NO la API oficial de WhatsApp Business de Meta).
 * ============================================================================
 *  Mismo enfoque que usan la mayoría de plataformas de delivery de la región
 *  (OlaClick, etc.): el restaurante escanea un QR desde SU propio WhatsApp,
 *  igual que "Dispositivos vinculados", y desde ahí el backend puede mandar
 *  mensajes automáticos (pedido recibido / listo) usando ese mismo número —
 *  sin costo por mensaje ni verificación de negocio con Meta.
 *
 *  Trade-off importante (explicado y aceptado por el restaurante/operador):
 *  no es un canal oficial, así que WhatsApp puede bloquear el número si
 *  detecta un patrón de envío automatizado — sobre todo a volumen. Por eso
 *  el MVP solo manda 1-2 mensajes puntuales por pedido (recibido/listo), no
 *  mensajería masiva ni marketing.
 *
 *  Una sesión (WASocket) por restaurante, en memoria — este proceso Node
 *  (PM2 fork único) sostiene todas las sesiones vinculadas a la vez. Para la
 *  escala actual de QuickTap (decenas de restaurantes, no miles) esto es
 *  aceptable; si el número de restaurantes con el bot activo crece mucho,
 *  esto necesitaría moverse a un proceso/worker aparte.
 *
 *  Las credenciales de la sesión (useMultiFileAuthState) se guardan en disco
 *  bajo uploads/whatsapp-sessions/<restaurantId> — mismo directorio gitignored
 *  y respaldado aparte que el resto de uploads/ (ver CLAUDE.md).
 */

export type WhatsappBotStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected';

interface SessionState {
  status: WhatsappBotStatus;
  qrDataUrl?: string;
  connectedNumber?: string;
  sock?: WASocket;
  /** Evita reconexiones en cascada si algo sigue fallando inmediatamente tras conectar. */
  reconnectAttempts: number;
}

const sessions = new Map<string, SessionState>();

export const DEFAULT_WELCOME_TEMPLATE = ['¡Hola! 👋 Bienvenido a *{{restaurant}}*.', '', 'Puedes ver el menú y hacer tu pedido aquí:', '{{link}}'].join(
  '\n',
);
/** Mismo mensaje, hablado en términos de reservar cancha en vez de pedir comida —
 * se usa solo mientras el club no haya guardado su propio texto. */
export const DEFAULT_WELCOME_TEMPLATE_CLUB = [
  '¡Hola! 👋 Bienvenido a *{{restaurant}}*.',
  '',
  'Reserva tu cancha aquí:',
  '{{link}}',
].join('\n');

function sessionDir(restaurantId: string): string {
  return path.join(UPLOADS_DIR, 'whatsapp-sessions', restaurantId);
}

function getOrCreateSessionState(restaurantId: string): SessionState {
  let s = sessions.get(restaurantId);
  if (!s) {
    s = { status: 'idle', reconnectAttempts: 0 };
    sessions.set(restaurantId, s);
  }
  return s;
}

function emitStatus(restaurantId: string) {
  const s = getOrCreateSessionState(restaurantId);
  emitToKitchen(restaurantId, SocketEvents.WHATSAPP_BOT_STATUS, {
    status: s.status,
    connectedNumber: s.connectedNumber ?? null,
  });
}

/** JID de WhatsApp a partir de un teléfono en cualquier formato (con o sin "+", local o
 * internacional): el número se completa al formato internacional primero — ver
 * `toInternationalWhatsappDigits`. */
function toJid(phone: string): string {
  return `${toInternationalWhatsappDigits(phone)}@s.whatsapp.net`;
}

/** Trae el pedido con sus ítems — hace falta para armar el detalle de "qué pidió" en el
 * mensaje al verificador de pagos (ver buildVerifierCaption). */
async function fetchOrderWithItems(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
}

/** Mensaje que recibe el verificador de pagos junto con la foto del comprobante: qué pidió el
 * cliente, su nombre y el monto exacto a comprobar. */
function buildVerifierCaption(order: NonNullable<Awaited<ReturnType<typeof fetchOrderWithItems>>>): string {
  const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
  const symbol = CURRENCY_SYMBOLS[order.currency];
  return [
    `📄 Comprobante de pago — Pedido #${order.orderNumber}`,
    `👤 Cliente: ${order.customerName ?? 'Cliente'}`,
    `📞 ${order.customerPhone ?? ''}`,
    `🧾 Pidió: ${itemsSummary || '—'}`,
    `💰 Monto a verificar: ${formatBs(order.totalBs)} (${formatMoney(order.totalBase, symbol)})`,
    '',
    'Responde *Aprobado* o *Rechazado*.',
  ].join('\n');
}

/** Mensaje del modo FULL_ORDER (ver Restaurant.whatsappOrderMode): el pedido completo,
 * mandado al WhatsApp del propio negocio en vez de pedirle comprobante al cliente —
 * el negocio confirma "Aprobado"/"Rechazado" a mano tras coordinar el cobro por fuera. */
function buildFullOrderCaption(order: NonNullable<Awaited<ReturnType<typeof fetchOrderWithItems>>>): string {
  const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join('\n');
  const symbol = CURRENCY_SYMBOLS[order.currency];
  const lines = [
    `🛎️ Nuevo pedido #${order.orderNumber} (${order.channel === 'DELIVERY' ? 'Delivery' : 'Pickup'})`,
    `👤 Cliente: ${order.customerName ?? 'Cliente'}`,
    `📞 ${order.customerPhone ?? ''}`,
  ];
  if (order.channel === 'DELIVERY' && order.customerAddress) lines.push(`📍 ${order.customerAddress}`);
  lines.push('', `🧾 Pedido:\n${itemsSummary || '—'}`, '');
  if (order.paymentMethod) lines.push(`💳 Pago: ${PAYMENT_LABELS[order.paymentMethod]}`);
  lines.push(`💰 Total: ${formatBs(order.totalBs)} (${formatMoney(order.totalBase, symbol)})`, '', 'Responde *Aprobado* o *Rechazado*.');
  return lines.join('\n');
}

export const whatsappBotService = {
  /** Texto del pedido completo para el modo FULL_ORDER — ver checkoutDelivery en order.service.ts. */
  buildFullOrderCaption,

  /** Estado actual (para pintar Ajustes -> WhatsApp sin esperar el próximo evento de socket). */
  getStatus(restaurantId: string) {
    const s = getOrCreateSessionState(restaurantId);
    return { status: s.status, qrDataUrl: s.qrDataUrl ?? null, connectedNumber: s.connectedNumber ?? null };
  },

  /**
   * Arranca (o reutiliza) la sesión de un restaurante. Si no hay credenciales guardadas
   * todavía, WhatsApp manda un QR nuevo por `connection.update` — se convierte a imagen y
   * se emite por socket a la room del restaurante (Ajustes lo escucha y lo pinta).
   */
  async connect(restaurantId: string): Promise<void> {
    const existing = sessions.get(restaurantId);
    if (existing && (existing.status === 'connected' || existing.status === 'connecting' || existing.status === 'qr')) {
      // Ya hay una sesión viva o en curso — no abrir una segunda en paralelo.
      return;
    }

    const dir = sessionDir(restaurantId);
    fs.mkdirSync(dir, { recursive: true });

    const s = getOrCreateSessionState(restaurantId);
    s.status = 'connecting';
    s.qrDataUrl = undefined;
    emitStatus(restaurantId);

    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      // Nombre visible como "dispositivo vinculado" dentro de la app de WhatsApp del restaurante.
      browser: ['QuickTap', 'Chrome', '1.0'],
    });
    s.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      // 'notify' = mensaje real entrante en vivo (no historial sincronizado al conectar).
      if (type !== 'notify') return;
      for (const msg of messages) {
        this.handleIncomingMessage(restaurantId, msg).catch(() => undefined);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        s.status = 'qr';
        s.qrDataUrl = await QRCode.toDataURL(qr);
        emitToKitchen(restaurantId, SocketEvents.WHATSAPP_BOT_QR, { qrDataUrl: s.qrDataUrl });
        emitStatus(restaurantId);
      }

      if (connection === 'open') {
        s.status = 'connected';
        s.qrDataUrl = undefined;
        s.reconnectAttempts = 0;
        const rawNumber = sock.user?.phoneNumber ?? sock.user?.id?.split(/[:@]/)[0] ?? null;
        s.connectedNumber = rawNumber ? `+${rawNumber.replace(/\D/g, '')}` : undefined;
        await prisma.restaurant
          .update({
            where: { id: restaurantId },
            data: { whatsappBotConnectedNumber: s.connectedNumber ?? null },
          })
          .catch(() => undefined);
        emitStatus(restaurantId);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        sessions.delete(restaurantId);

        if (loggedOut) {
          // Vínculo removido desde el teléfono (o "Cerrar sesión" en Ajustes): borra la
          // sesión guardada, no tiene sentido reintentar con credenciales ya inválidas.
          await this.forgetSession(restaurantId);
          return;
        }

        // Corte de red u otro motivo recuperable: reintenta con backoff simple, hasta 5 veces.
        const attempts = (s.reconnectAttempts ?? 0) + 1;
        if (attempts <= 5) {
          const next = getOrCreateSessionState(restaurantId);
          next.reconnectAttempts = attempts;
          next.status = 'disconnected';
          emitStatus(restaurantId);
          setTimeout(() => this.connect(restaurantId).catch(() => undefined), Math.min(attempts * 3000, 15000));
        } else {
          const next = getOrCreateSessionState(restaurantId);
          next.status = 'disconnected';
          emitStatus(restaurantId);
        }
      }
    });
  },

  /**
   * Mensaje entrante de un cliente (o del verificador de pagos): rutea antes de caer en el
   * saludo de bienvenida, para que ni el verificador ni un comprobante de pago disparen el
   * saludo normal. Ignora mensajes propios (los que este mismo bot mandó), de grupos y de
   * difusión de estados — solo conversaciones 1 a 1.
   */
  async handleIncomingMessage(restaurantId: string, msg: WAMessage): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;
    // WhatsApp identifica a algunos contactos con un "@lid" (linked ID, más privado) en vez de
    // su número real — remoteJid en ese caso NO tiene el teléfono, así que ninguna comparación
    // por dígitos (verificador, pedido en AWAITING_PROOF) matcheaba nunca. Baileys expone el JID
    // real del teléfono en remoteJidAlt cuando esto pasa; se usa ese para matchear por dígitos,
    // pero se sigue respondiendo a "jid" (el hilo real de la conversación).
    const phoneJid = msg.key.remoteJidAlt || jid;
    const phoneDigits = phoneJid.replace(/@.*/, '');

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        slug: true,
        name: true,
        businessType: true,
        whatsappBotWelcomeEnabled: true,
        whatsappBotWelcomeMessage: true,
        whatsappBotPaymentVerifierPhone: true,
      },
    });
    if (!restaurant) return;

    // WhatsApp envuelve el contenido real en ephemeralMessage/viewOnceMessage(V2) cuando el
    // chat tiene mensajes temporales o la foto se manda como "ver una vez" — sin desenvolver
    // esto, ni el texto ni la imagen se detectan y el mensaje cae (mal) al saludo de bienvenida.
    const content = extractMessageContent(msg.message) ?? msg.message;

    // 1) ¿El verificador de pagos escribió? Nunca dispara el saludo — solo se interpreta como
    // Aprobado/Rechazado (ver order-payment-verification.service.ts).
    if (
      restaurant.whatsappBotPaymentVerifierPhone &&
      restaurant.whatsappBotPaymentVerifierPhone.replace(/\D/g, '') === phoneDigits
    ) {
      const text = content.conversation ?? content.extendedTextMessage?.text;
      if (text) {
        // En clubes, el verificador también resuelve comprobantes de DEUDA (recordatorio
        // de cobranza) — se intenta primero ese flujo y, si no hay ninguno esperando,
        // cae al de pedidos de siempre.
        if (restaurant.businessType === 'SPORTS_CLUB') {
          const handled = await this.routeClubDebtVerifierReply(restaurantId, text);
          if (handled) return;
        }
        await this.routeVerifierReply(restaurantId, text);
      }
      return;
    }

    // 2) ¿Es una imagen? Posible comprobante de pago — si no hay ninguna verificación
    // esperando comprobante de ese teléfono, se ignora en silencio (no cae al saludo: una
    // foto no es un "primer mensaje" típico de un cliente nuevo).
    if (content.imageMessage) {
      // Club: una foto de un cliente con deuda abierta es su comprobante de pago
      // (flujo de cobranza — ver club-debt-bot.service.ts). Si no debe nada, cae al
      // matching de pedidos de siempre.
      if (restaurant.businessType === 'SPORTS_CLUB') {
        const handled = await this.routeClubDebtProofImage(restaurantId, phoneDigits, msg);
        if (handled) return;
      }
      await this.routeIncomingProofImage(restaurantId, phoneDigits, msg);
      return;
    }

    // 3) Texto normal: saludo de bienvenida de siempre. Sin enfriamiento — en hora pico el
    // restaurante necesita que el bot conteste cada mensaje lo más rápido posible, aunque sea
    // el mismo contacto escribiendo varias veces seguidas.
    if (!restaurant.whatsappBotWelcomeEnabled) return;

    const s = sessions.get(restaurantId);
    if (!s || s.status !== 'connected' || !s.sock) return;

    // El enlace del saludo tiene que resolver a la página pública correcta según el
    // vertical: /club/:slug (reservas de cancha) para SPORTS_CLUB, /r/:slug (menú)
    // para el resto — mandarle a un jugador el link del menú de un restaurante
    // sería un enlace roto para su propósito.
    const isClub = restaurant.businessType === 'SPORTS_CLUB';
    const link = isClub ? `${env.appUrl}/club/${restaurant.slug}` : `${env.appUrl}/r/${restaurant.slug}`;
    const defaultTemplate = isClub ? DEFAULT_WELCOME_TEMPLATE_CLUB : DEFAULT_WELCOME_TEMPLATE;
    const text = renderWhatsappTemplate(restaurant.whatsappBotWelcomeMessage || defaultTemplate, {
      restaurant: restaurant.name,
      link,
    });

    await s.sock.sendMessage(jid, { text }).catch(() => undefined);
  },

  /**
   * Foto entrante de un cliente con una verificación de pago AWAITING_PROOF abierta: la
   * descarga, la guarda, la reenvía al verificador (o la encola si ya hay otra en curso para
   * este restaurante) y le acusa recibo al cliente.
   */
  async routeIncomingProofImage(restaurantId: string, phoneDigits: string, msg: WAMessage): Promise<void> {
    const match = await orderPaymentVerificationService.matchAwaitingProofOrder(restaurantId, phoneDigits);
    if (!match) {
      console.log(`[whatsapp-bot] imagen de ${phoneDigits} sin verificación AWAITING_PROOF pendiente — se ignora.`);
      return;
    }

    const s = sessions.get(restaurantId);
    if (!s || s.status !== 'connected' || !s.sock) return;

    let buffer: Buffer;
    try {
      buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
    } catch (err) {
      console.error('[whatsapp-bot] no se pudo descargar el comprobante de pago:', err);
      return;
    }

    const dir = path.join(UPLOADS_DIR, 'whatsapp-payment-proofs', restaurantId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    buffer = await compressImageBuffer(buffer); // comprobante: 1200px q80, no llena el disco
    fs.writeFileSync(path.join(dir, filename), buffer);
    const proofImageUrl = `/uploads/whatsapp-payment-proofs/${restaurantId}/${filename}`;

    const { shouldForwardNow } = await orderPaymentVerificationService.recordProofImage(match.id, proofImageUrl);

    if (shouldForwardNow) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { whatsappBotPaymentVerifierPhone: true },
      });
      const order = await fetchOrderWithItems(match.orderId);
      if (restaurant?.whatsappBotPaymentVerifierPhone && order) {
        await this.sendImage(restaurantId, restaurant.whatsappBotPaymentVerifierPhone, buffer, buildVerifierCaption(order));
      }
    }

    await this.sendMessage(
      restaurantId,
      phoneDigits,
      '📥 Recibimos tu comprobante, estamos confirmando tu pago con el restaurante.',
    );
  },

  /**
   * Club: foto de un cliente con deuda abierta = comprobante de cobranza. Devuelve false
   * si ese teléfono no debe nada (el caller sigue con el flujo de pedidos).
   */
  async routeClubDebtProofImage(restaurantId: string, phoneDigits: string, msg: WAMessage): Promise<boolean> {
    const match = await clubDebtBotService.matchDebtByPhone(restaurantId, phoneDigits).catch(() => null);
    if (!match) return false;

    let buffer: Buffer;
    try {
      buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
    } catch (err) {
      console.error('[whatsapp-bot] no se pudo descargar el comprobante de deuda:', err);
      return true;
    }

    const dir = path.join(UPLOADS_DIR, 'whatsapp-payment-proofs', restaurantId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    buffer = await compressImageBuffer(buffer); // comprobante: 1200px q80, no llena el disco
    fs.writeFileSync(path.join(dir, filename), buffer);
    const proofImageUrl = `/uploads/whatsapp-payment-proofs/${restaurantId}/${filename}`;

    const { verification, shouldForwardNow } = await clubDebtBotService.createVerification(
      restaurantId,
      match.source,
      match.row,
      phoneDigits,
      proofImageUrl,
    );

    if (shouldForwardNow) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { whatsappBotPaymentVerifierPhone: true },
      });
      if (restaurant?.whatsappBotPaymentVerifierPhone) {
        const caption = await clubDebtBotService.buildVerifierCaption(verification);
        await this.sendImage(restaurantId, restaurant.whatsappBotPaymentVerifierPhone, buffer, caption);
      }
    }

    await this.sendMessage(restaurantId, phoneDigits, '📥 Recibimos tu comprobante, estamos confirmando tu pago. Te avisamos por aquí.');
    return true;
  },

  /** Club: "Aprobado"/"Rechazado" del verificador sobre un comprobante de DEUDA. Devuelve
   * false si no había ninguno esperando (el caller prueba con el flujo de pedidos). */
  async routeClubDebtVerifierReply(restaurantId: string, text: string): Promise<boolean> {
    const result = await clubDebtBotService.resolveVerifierReply(restaurantId, text).catch(() => ({ handled: false as const }));
    if (!result.handled) return false;

    if (result.action === 'approve') {
      await this.sendMessage(
        restaurantId,
        result.verification.customerPhone,
        '✅ ¡Tu pago fue confirmado! Tu deuda quedó al día. Gracias por ponerte al corriente.',
      );
    } else {
      await this.sendMessage(
        restaurantId,
        result.verification.customerPhone,
        '⚠️ No pudimos confirmar tu pago con ese comprobante. Revísalo y reenvíalo por este chat, por favor.',
      );
    }

    // Siguiente comprobante de deuda en cola, si hay.
    const next = await clubDebtBotService.dequeueNext(restaurantId);
    if (next) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { whatsappBotPaymentVerifierPhone: true },
      });
      if (restaurant?.whatsappBotPaymentVerifierPhone && next.image) {
        const caption = await clubDebtBotService.buildVerifierCaption(next.verification);
        await this.sendImage(restaurantId, restaurant.whatsappBotPaymentVerifierPhone, next.image, caption);
      }
    }
    return true;
  },

  /** Respuesta del verificador: "Aprobado" acepta el pedido a cocina, "Rechazado" según el
   * modo — pide reenviar comprobante (PAYMENT_VERIFICATION) o queda rechazado (FULL_ORDER,
   * ver order-payment-verification.service.ts). */
  async routeVerifierReply(restaurantId: string, text: string): Promise<void> {
    const result = await orderPaymentVerificationService.resolveVerifierReply(restaurantId, text);
    if (result.action === 'ignore' || !result.verification) return;

    if (result.action === 'approve') {
      const { customerPhone, orderId, isFullOrder } = await orderPaymentVerificationService.approve(result.verification.id);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      await this.sendMessage(
        restaurantId,
        customerPhone,
        isFullOrder
          ? `✅ Tu pedido #${order?.orderNumber ?? ''} fue confirmado. ¡Ya lo estamos preparando!`
          : `✅ Tu pago fue confirmado. ¡Tu pedido #${order?.orderNumber ?? ''} ya está en proceso!`,
      );
    } else {
      const { customerPhone, isFullOrder } = await orderPaymentVerificationService.reject(result.verification.id);
      await this.sendMessage(
        restaurantId,
        customerPhone,
        isFullOrder
          ? '⚠️ Tu pedido no pudo ser confirmado. Contáctanos por este mismo chat si tienes dudas.'
          : '⚠️ No pudimos confirmar tu pago. Por favor reenvía tu comprobante.',
      );
    }
    await this.advanceQueue(restaurantId);
  },

  /** Tras resolver una verificación, reenvía al verificador la siguiente que estaba en cola (si hay):
   * la foto del comprobante (PAYMENT_VERIFICATION) o el texto del pedido completo (FULL_ORDER, sin
   * proofImageUrl — ver order-payment-verification.service.ts). */
  async advanceQueue(restaurantId: string): Promise<void> {
    const next = await orderPaymentVerificationService.dequeueNext(restaurantId);
    if (!next) return;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { whatsappBotPaymentVerifierPhone: true },
    });
    if (!restaurant?.whatsappBotPaymentVerifierPhone) return;

    if (!next.proofImageUrl) {
      const order = await fetchOrderWithItems(next.orderId);
      if (!order) return;
      await this.sendMessage(restaurantId, restaurant.whatsappBotPaymentVerifierPhone, buildFullOrderCaption(order));
      return;
    }

    const order = await fetchOrderWithItems(next.orderId);
    if (!order) return;
    const imagePath = path.join(process.cwd(), next.proofImageUrl.replace(/^\//, ''));
    const buffer = await fs.promises.readFile(imagePath).catch(() => null);
    if (!buffer) return;
    await this.sendImage(restaurantId, restaurant.whatsappBotPaymentVerifierPhone, buffer, buildVerifierCaption(order));
  },

  /** Desvincula a propósito: cierra la sesión en WhatsApp y borra las credenciales guardadas. */
  async disconnect(restaurantId: string): Promise<void> {
    const s = sessions.get(restaurantId);
    if (s?.sock) {
      await s.sock.logout().catch(() => undefined);
    }
    await this.forgetSession(restaurantId);
  },

  /** Limpia el estado en memoria + las credenciales en disco + lo marca desconectado en BD. */
  async forgetSession(restaurantId: string): Promise<void> {
    sessions.delete(restaurantId);
    await fs.promises.rm(sessionDir(restaurantId), { recursive: true, force: true }).catch(() => undefined);
    await prisma.restaurant
      .update({ where: { id: restaurantId }, data: { whatsappBotConnectedNumber: null } })
      .catch(() => undefined);
    emitToKitchen(restaurantId, SocketEvents.WHATSAPP_BOT_STATUS, { status: 'disconnected', connectedNumber: null });
  },

  async updateSettings(restaurantId: string, input: UpdateWhatsappBotSettingsInput) {
    return prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(input.notifyReceived !== undefined ? { whatsappBotNotifyReceived: input.notifyReceived } : {}),
        ...(input.notifyReady !== undefined ? { whatsappBotNotifyReady: input.notifyReady } : {}),
        ...(input.welcomeEnabled !== undefined ? { whatsappBotWelcomeEnabled: input.welcomeEnabled } : {}),
        ...(input.welcomeMessage !== undefined ? { whatsappBotWelcomeMessage: input.welcomeMessage } : {}),
        ...(input.paymentVerifierPhone !== undefined
          ? {
              whatsappBotPaymentVerifierPhone: input.paymentVerifierPhone
                ? formatVenezuelanWhatsappPhone(input.paymentVerifierPhone).replace(/\D/g, '')
                : null,
            }
          : {}),
        ...(input.orderMode !== undefined ? { whatsappOrderMode: input.orderMode } : {}),
        ...(input.debtRemindersEnabled !== undefined
          ? { whatsappBotDebtRemindersEnabled: input.debtRemindersEnabled }
          : {}),
      },
      select: {
        whatsappBotNotifyReceived: true,
        whatsappBotNotifyReady: true,
        whatsappBotWelcomeEnabled: true,
        whatsappBotWelcomeMessage: true,
        whatsappBotPaymentVerifierPhone: true,
        whatsappOrderMode: true,
        whatsappBotDebtRemindersEnabled: true,
      },
    });
  },

  /**
   * Manda un mensaje de texto libre por la sesión vinculada de ese restaurante. No hace nada
   * (silencioso) si el bot no está conectado o el restaurante no tiene teléfono del cliente —
   * este canal es un "extra" sobre el flujo normal, nunca debe tumbar la creación del pedido.
   */
  async sendMessage(restaurantId: string, phone: string | null | undefined, message: string): Promise<boolean> {
    if (!phone) return false;
    const s = sessions.get(restaurantId);
    // Sin sesión del bot viejo (apagado por CHATBOTS_ENABLED), el envío sale por la
    // instancia de Evolution del negocio, si la vinculó. Cablearlo AQUÍ revive de una vez
    // todos los avisos transaccionales que ya llamaban a este método — comanda al
    // repartidor, "va en camino", "listo para retirar" — sin tocar cada sitio.
    if (!s || s.status !== 'connected' || !s.sock) {
      const { whatsappLinkService } = await import('../whatsapp-link/whatsapp-link.service');
      return whatsappLinkService.enviar(restaurantId, phone, message);
    }
    try {
      const jid = toJid(phone);
      // WhatsApp no falla al mandarle a un número que no existe: se traga el mensaje y el
      // panel mostraba "Mensaje enviado". Se comprueba antes, y si no existe se devuelve
      // false para que el frontend caiga al enlace wa.me y alguien lo mande a mano.
      const exists = (await s.sock.onWhatsApp(jid))?.[0];
      if (!exists?.exists) return false;
      await s.sock.sendMessage(exists.jid ?? jid, { text: message });
      return true;
    } catch {
      return false;
    }
  },

  /** Manda una imagen (ej. comprobante de pago reenviado al verificador) con un pie de foto opcional. */
  async sendImage(restaurantId: string, phone: string | null | undefined, image: Buffer, caption?: string): Promise<boolean> {
    if (!phone) return false;
    const s = sessions.get(restaurantId);
    if (!s || s.status !== 'connected' || !s.sock) return false;
    try {
      await s.sock.sendMessage(toJid(phone), { image, caption });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Al arrancar el servidor: reconecta los restaurantes que tenían el bot habilitado (best
   * effort, no bloquea el resto del bootstrap — ver server.ts). Como las credenciales ya están
   * guardadas en disco, esto NO pide un QR nuevo salvo que la sesión haya sido invalidada.
   */
  async reconnectEnabledSessions(): Promise<void> {
    const restaurants = await prisma.restaurant.findMany({
      where: { whatsappBotEnabled: true },
      select: { id: true },
    });
    for (const r of restaurants) {
      // Si no hay carpeta de credenciales (nunca se vinculó o se desvinculó), no tiene sentido
      // abrir una sesión que solo va a pedir un QR sin que nadie lo esté mirando.
      if (fs.existsSync(sessionDir(r.id))) {
        this.connect(r.id).catch(() => undefined);
      }
    }
  },
};
