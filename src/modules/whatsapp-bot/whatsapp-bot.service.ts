import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WAMessage,
  WASocket,
} from '@whiskeysockets/baileys';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { renderWhatsappTemplate } from '../../utils/whatsapp';
import { UpdateWhatsappBotSettingsInput } from './whatsapp-bot.dto';

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

/** No contestar dos veces al mismo contacto dentro de esta ventana — si no, cada mensaje de
 * una conversación en curso dispara otra vez el saludo, lo cual se ve como un bot roto (y
 * abulta el patrón de envío automatizado que puede hacer que WhatsApp bloquee el número). */
const WELCOME_REPLY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastWelcomeReplyAt = new Map<string, number>();

export const DEFAULT_WELCOME_TEMPLATE = ['¡Hola! 👋 Bienvenido a *{{restaurant}}*.', '', 'Puedes ver el menú y hacer tu pedido aquí:', '{{link}}'].join(
  '\n',
);

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

/** JID de WhatsApp a partir de un teléfono en cualquier formato (solo dígitos, con o sin "+"). */
function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

export const whatsappBotService = {
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
   * Mensaje entrante de un cliente: contesta con el saludo de bienvenida + el enlace del menú,
   * una sola vez por contacto dentro de WELCOME_REPLY_COOLDOWN_MS. Ignora mensajes propios (los
   * que este mismo bot mandó), de grupos y de difusión de estados — solo conversaciones 1 a 1.
   */
  async handleIncomingMessage(restaurantId: string, msg: WAMessage): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

    const cooldownKey = `${restaurantId}:${jid}`;
    const last = lastWelcomeReplyAt.get(cooldownKey) ?? 0;
    if (Date.now() - last < WELCOME_REPLY_COOLDOWN_MS) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, name: true, whatsappBotWelcomeEnabled: true, whatsappBotWelcomeMessage: true },
    });
    if (!restaurant || !restaurant.whatsappBotWelcomeEnabled) return;

    const s = sessions.get(restaurantId);
    if (!s || s.status !== 'connected' || !s.sock) return;

    const link = `${env.appUrl}/r/${restaurant.slug}`;
    const text = renderWhatsappTemplate(restaurant.whatsappBotWelcomeMessage || DEFAULT_WELCOME_TEMPLATE, {
      restaurant: restaurant.name,
      link,
    });

    // Marca el enfriamiento ANTES de mandar: si sendMessage tarda o el cliente escribe de nuevo
    // mientras tanto, no queremos dos saludos en carrera.
    lastWelcomeReplyAt.set(cooldownKey, Date.now());
    await s.sock.sendMessage(jid, { text }).catch(() => undefined);
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
      },
      select: {
        whatsappBotNotifyReceived: true,
        whatsappBotNotifyReady: true,
        whatsappBotWelcomeEnabled: true,
        whatsappBotWelcomeMessage: true,
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
    if (!s || s.status !== 'connected' || !s.sock) return false;
    try {
      await s.sock.sendMessage(toJid(phone), { text: message });
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
