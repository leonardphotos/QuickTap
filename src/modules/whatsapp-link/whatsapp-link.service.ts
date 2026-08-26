import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http-error';
import { evolution } from '../../utils/evolution';
import { telefonoCanonico } from '../../utils/phone';

/**
 * WhatsApp vinculado por negocio (y el de la plataforma), sobre Evolution API.
 *
 * `restaurantId = null` es la instancia del MASTER: la que manda las cobranzas de QuickTap.
 * Va con las barandas más duras de todo el módulo (ver enviar()): fue exactamente el caso
 * baneado en agosto 2026, y la diferencia ahora es que cada envío se vigila — si WhatsApp
 * deja de confirmar entregas (ACK), la instancia se auto-pausa en vez de seguir quemando el
 * número. Aquella vez sendMessage resolvía, nada llegaba, y no había nada mirando.
 */

// Techo de envíos por instancia por hora. Transaccional de un negocio con sus clientes: de
// sobra. Para spam: inservible — que es la idea.
const MAX_POR_HORA = 30;
// Y por día: el de negocio holgado (un local ocupado manda decenas de avisos legítimos), el
// del master ridículo a propósito — la cobranza es manual y pocos al día ES el patrón seguro.
const MAX_POR_DIA = 150;
const MAX_POR_DIA_MASTER = 20;
// Envíos seguidos sin ACK que activan la auto-pausa.
const MAX_SIN_ACK = 5;
// Errores de envío seguidos (número inexistente, bloqueado, rechazo del servidor) que también
// auto-pausan: insistirle a destinatarios que fallan es otra firma clásica de spam.
const MAX_ERRORES_SEGUIDOS = 4;
// Pausa entre envíos de una misma instancia, aleatoria: nadie escribe cinco mensajes en tres
// segundos. El primero de una cola vacía sale al instante — una persona también responde
// rápido UN mensaje; lo inhumano es la ráfaga.
const JITTER_MIN_MS = 8_000;
const JITTER_MAX_MS = 25_000;

// Mismos eventos que configura crearInstancia — setWebhook los reaplica a instancias viejas.
const WEBHOOK_EVENTS = ['CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'MESSAGES_UPSERT'];

const contadorHora = new Map<string, { desde: number; enviados: number }>();
const contadorDia = new Map<string, { dia: string; enviados: number }>();
const erroresSeguidos = new Map<string, number>();
// Cola por instancia: serializa los envíos para poder meter el jitter entre uno y otro.
const colaPorInstancia = new Map<string, Promise<unknown>>();
const ultimoEnvioReal = new Map<string, number>();

function horaCaracas(): number {
  return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas', hour: 'numeric', hour12: false }));
}

function diaCaracas(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

/**
 * Elige una redacción al azar entre variantes del mismo mensaje. Cien mensajes idénticos es
 * el detector de bots más viejo que existe; tres redacciones rotando con datos propios
 * (nombre, número de pedido) se leen como escritas por alguien.
 */
export function frase(...variantes: string[]): string {
  return variantes[Math.floor(Math.random() * variantes.length)];
}

function webhookUrl(): string {
  // Evolution corre en este mismo VPS: el webhook viaja por localhost, sin salir a internet.
  return `http://127.0.0.1:${env.port}/api/v1/public/wa-webhook/${env.evolution.webhookSecret}`;
}

async function instanciaDe(restaurantId: string | null) {
  return prisma.waInstance.findFirst({ where: { restaurantId } });
}

export const whatsappLinkService = {
  disponible: () => evolution.disponible(),

  /** Estado para la pantalla de Ajustes (o el master). */
  async estado(restaurantId: string | null) {
    if (!evolution.disponible()) return { disponible: false as const };
    const fila = await instanciaDe(restaurantId);
    return {
      disponible: true as const,
      vinculado: fila?.status === 'CONNECTED',
      status: fila?.status ?? 'NONE',
      phone: fila?.phone ?? null,
      paused: !!(fila?.paused || fila?.autoPaused),
      autoPaused: !!fila?.autoPaused,
    };
  },

  /** Crea (si hace falta) la instancia y devuelve el QR para escanear desde el teléfono. */
  async vincular(restaurantId: string | null) {
    if (!evolution.disponible()) throw badRequest('WhatsApp no está disponible en este momento.');
    let fila = await instanciaDe(restaurantId);
    if (!fila) {
      // Nombre opaco: no revela de qué negocio es si algún log de Evolution se filtra.
      const instanceName = `qt_${crypto.randomBytes(6).toString('hex')}`;
      await evolution.crearInstancia(instanceName, webhookUrl());
      fila = await prisma.waInstance.create({ data: { restaurantId, instanceName, status: 'CONNECTING' } });
    }
    // Reconfigurar el webhook en cada vinculación: una instancia creada antes de que
    // escucháramos mensajes entrantes se actualiza sola la próxima vez que alguien vincula.
    await evolution.setWebhook(fila.instanceName, webhookUrl(), WEBHOOK_EVENTS).catch(() => undefined);
    const qr = await evolution.qr(fila.instanceName);
    if (!qr.base64 && !qr.code) {
      // Sin QR y sin error: ya está vinculada.
      const st = await evolution.estado(fila.instanceName);
      if (st.instance?.state === 'open') {
        await prisma.waInstance.update({ where: { id: fila.id }, data: { status: 'CONNECTED' } });
        return { vinculado: true as const };
      }
    }
    return { vinculado: false as const, qr: qr.base64 ?? null };
  },

  /** Desvincula el número. La fila queda: re-vincular reutiliza la instancia. */
  async desvincular(restaurantId: string | null) {
    const fila = await instanciaDe(restaurantId);
    if (!fila) return { ok: true };
    await evolution.logout(fila.instanceName).catch(() => undefined);
    await prisma.waInstance.update({
      where: { id: fila.id },
      data: { status: 'DISCONNECTED', phone: null, pendingAcks: 0, autoPaused: false },
    });
    return { ok: true };
  },

  /** Quita la auto-pausa a mano, después de revisar que el número sigue vivo. */
  async reanudar(restaurantId: string | null) {
    const fila = await instanciaDe(restaurantId);
    if (!fila) throw badRequest('No hay WhatsApp vinculado.');
    await prisma.waInstance.update({ where: { id: fila.id }, data: { paused: false, autoPaused: false, pendingAcks: 0 } });
    return { ok: true };
  },

  /** ¿Este negocio tiene su WhatsApp vinculado y operativo? Barato: una fila por negocio. */
  async vinculado(restaurantId: string | null): Promise<boolean> {
    if (!evolution.disponible()) return false;
    const fila = await instanciaDe(restaurantId);
    return !!fila && fila.status === 'CONNECTED' && !fila.paused && !fila.autoPaused;
  },

  /**
   * Envía un texto por la instancia del negocio (o la de plataforma con null).
   * Devuelve false — sin tirar — cuando no se puede: el que llama SIEMPRE tiene su fallback
   * (el enlace wa.me de toda la vida), así que no enviar jamás debe romper una operación.
   */
  async enviar(restaurantId: string | null, telefono: string, texto: string): Promise<boolean> {
    return this.despachar(restaurantId, telefono, (instancia, destino) => evolution.enviarTexto(instancia, destino, texto));
  },

  /** Imagen (base64) por los MISMOS rieles que el texto: cola, jitter, topes y detectores. */
  async enviarImagen(restaurantId: string | null, telefono: string, base64: string, caption?: string): Promise<boolean> {
    return this.despachar(restaurantId, telefono, (instancia, destino) => evolution.enviarImagen(instancia, destino, base64, caption));
  },

  async despachar(
    restaurantId: string | null,
    telefono: string,
    hacer: (instanceName: string, destino: string) => Promise<unknown>,
  ): Promise<boolean> {
    if (!evolution.disponible()) return false;
    const fila = await instanciaDe(restaurantId);
    if (!fila || fila.status !== 'CONNECTED' || fila.paused || fila.autoPaused) return false;

    // Horario humano SOLO para el master: nadie cobra a las 11 de la noche, y un cobro
    // nocturno se reporta como spam. Los negocios NO llevan horario — su mensaje responde a
    // algo que el cliente acaba de hacer (pidió a las 9:30 pm, se le confirma a las 9:30 pm),
    // y responder al momento es exactamente lo que hace una persona.
    if (restaurantId === null) {
      const h = horaCaracas();
      if (h < 8 || h >= 20) return false;
    }

    // Techos por hora y por día, en memoria: exacto no hace falta, barato sí. (El reinicio
    // nocturno de PM2 los resetea — coincide con el cambio de día, así que sirve igual.)
    const ahora = Date.now();
    const c = contadorHora.get(fila.id);
    if (!c || ahora - c.desde > 3600_000) contadorHora.set(fila.id, { desde: ahora, enviados: 0 });
    if (contadorHora.get(fila.id)!.enviados >= MAX_POR_HORA) return false;
    const dia = diaCaracas();
    const d = contadorDia.get(fila.id);
    if (!d || d.dia !== dia) contadorDia.set(fila.id, { dia, enviados: 0 });
    if (contadorDia.get(fila.id)!.enviados >= (restaurantId === null ? MAX_POR_DIA_MASTER : MAX_POR_DIA)) return false;

    const numero = telefono.replace(/\D/g, '').replace(/^0/, '58');
    const destino = numero.startsWith('58') ? numero : `58${numero}`;

    // A la cola de SU instancia: los envíos salen de a uno, con una pausa aleatoria entre
    // ellos. El turno espera al anterior aunque ese haya fallado.
    const previo = colaPorInstancia.get(fila.id) ?? Promise.resolve();
    const turno = previo.catch(() => undefined).then(async (): Promise<boolean> => {
      const desdeUltimo = Date.now() - (ultimoEnvioReal.get(fila.id) ?? 0);
      const jitter = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
      if (desdeUltimo < jitter) await new Promise((r) => setTimeout(r, jitter - desdeUltimo));

      // Releer el freno: pudo auto-pausarse mientras este turno esperaba en la cola.
      const viva = await prisma.waInstance.findUnique({ where: { id: fila.id }, select: { status: true, paused: true, autoPaused: true } });
      if (!viva || viva.status !== 'CONNECTED' || viva.paused || viva.autoPaused) return false;

      try {
        await hacer(fila.instanceName, destino);
      } catch {
        // Errores seguidos (número inexistente, bloqueado, rechazo) también auto-pausan:
        // insistirle a destinatarios que fallan es otra firma clásica de spam.
        const errs = (erroresSeguidos.get(fila.id) ?? 0) + 1;
        erroresSeguidos.set(fila.id, errs);
        if (errs >= MAX_ERRORES_SEGUIDOS) {
          await prisma.waInstance.update({ where: { id: fila.id }, data: { autoPaused: true } });
          console.error(`⚠️ WhatsApp auto-pausado (${MAX_ERRORES_SEGUIDOS} envíos fallidos seguidos): instancia ${fila.instanceName}`);
        }
        return false;
      }
      erroresSeguidos.set(fila.id, 0);
      ultimoEnvioReal.set(fila.id, Date.now());
      contadorHora.get(fila.id)!.enviados += 1;
      contadorDia.get(fila.id)!.enviados += 1;

      // El detector: cada envío suma un ACK pendiente; el webhook los va restando. Si se
      // acumulan MAX_SIN_ACK, el número probablemente está restringido — se auto-pausa y
      // el equipo lo ve en la pantalla, en vez de descubrirlo por los clientes.
      const tras = await prisma.waInstance.update({
        where: { id: fila.id },
        data: { pendingAcks: { increment: 1 }, lastSentAt: new Date() },
      });
      if (tras.pendingAcks >= MAX_SIN_ACK) {
        await prisma.waInstance.update({ where: { id: fila.id }, data: { autoPaused: true } });
        console.error(`⚠️ WhatsApp auto-pausado (${MAX_SIN_ACK} envíos sin confirmación de entrega): instancia ${fila.instanceName}`);
      }
      return true;
    });
    colaPorInstancia.set(fila.id, turno);
    return turno;
  },

  /** Webhook de Evolution: estado de conexión y confirmaciones de entrega. */
  async procesarEvento(evento: { event?: string; instance?: string; data?: Record<string, unknown> }) {
    if (!evento.instance) return;
    const fila = await prisma.waInstance.findUnique({ where: { instanceName: evento.instance } });
    if (!fila) return;

    if (evento.event === 'connection.update') {
      const estado = String((evento.data as { state?: string })?.state ?? '');
      const status = estado === 'open' ? 'CONNECTED' : estado === 'connecting' ? 'CONNECTING' : 'DISCONNECTED';
      const wuid = String((evento.data as { wuid?: string })?.wuid ?? '');
      await prisma.waInstance.update({
        where: { id: fila.id },
        data: { status, ...(wuid ? { phone: wuid.split('@')[0] } : {}) },
      });
      return;
    }

    // Mensaje ENTRANTE por el número vinculado: el "Aprobado" del verificador o la foto del
    // comprobante — lo que hace funcionar la verificación de pagos con Evolution. Se procesa
    // aparte y a la mejor suerte: un mensaje malformado no puede tumbar el webhook.
    if (evento.event === 'messages.upsert') {
      procesarMensajeEntrante(fila, evento.data as MensajeEntrante).catch((e) =>
        console.error('[whatsapp-link] mensaje entrante no procesado:', e?.message ?? e),
      );
      return;
    }

    // Cualquier update de mensaje con status de entrega/lectura cuenta como señal de vida:
    // el ACK exacto por mensaje no importa, importa que WhatsApp esté confirmando ALGO.
    if (evento.event === 'messages.update' || evento.event === 'send.message') {
      const status = String((evento.data as { status?: string })?.status ?? '');
      if (['DELIVERY_ACK', 'READ', 'SERVER_ACK', 'PLAYED'].includes(status)) {
        await prisma.waInstance.update({
          where: { id: fila.id },
          data: { pendingAcks: 0, lastAckAt: new Date(), autoPaused: false },
        });
      }
    }
  },
};

interface MensajeEntrante {
  key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown> & { base64?: string };
  messageType?: string;
}

/**
 * Un mensaje que LLEGÓ al número vinculado. Réplica del handleIncomingMessage del bot viejo,
 * pero alimentada por el webhook de Evolution en vez del socket de Baileys — y reusando los
 * mismos procesadores (routeVerifierReply, procesarComprobante*), que responden por
 * sendMessage/sendImage y por lo tanto salen de vuelta por Evolution.
 *
 * Deliberadamente NO responde el saludo de bienvenida: eso es función del chatbot
 * (CHATBOTS_ENABLED) — acá solo vive la verificación de pagos. Y los mensajes a la instancia
 * del MASTER (restaurantId null) se ignoran: su flujo de comprobantes de suscripción es otro
 * circuito y se migrará aparte.
 */
async function procesarMensajeEntrante(fila: { restaurantId: string | null; instanceName: string }, data: MensajeEntrante) {
  if (!fila.restaurantId) return;
  if (!data?.key || data.key.fromMe) return;
  const jid = data.key.remoteJid ?? '';
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;
  // Con "@lid" (linked ID) el remoteJid no trae el teléfono; el alterno sí — mismo caso que
  // en el bot viejo. Se matchea por dígitos del que tenga el número.
  const phoneDigits = (data.key.remoteJidAlt || jid).replace(/@.*/, '');

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: fila.restaurantId },
    select: { businessType: true, whatsappBotPaymentVerifierPhone: true },
  });
  if (!restaurant) return;

  // Desenvuelve mensajes efímeros / "ver una vez", igual que el bot viejo.
  const crudo = (data.message ?? {}) as Record<string, any>;
  const contenido: Record<string, any> =
    crudo.ephemeralMessage?.message ?? crudo.viewOnceMessage?.message ?? crudo.viewOnceMessageV2?.message ?? crudo;

  const { whatsappBotService } = await import('../whatsapp-bot/whatsapp-bot.service');

  // 1) ¿Escribió el verificador? Solo se interpreta como Aprobado/Rechazado.
  if (
    restaurant.whatsappBotPaymentVerifierPhone &&
    telefonoCanonico(restaurant.whatsappBotPaymentVerifierPhone) === telefonoCanonico(phoneDigits)
  ) {
    const texto = contenido.conversation ?? contenido.extendedTextMessage?.text;
    if (!texto) return;
    if (restaurant.businessType === 'SPORTS_CLUB') {
      const handled = await whatsappBotService.routeClubDebtVerifierReply(fila.restaurantId, texto);
      if (handled) return;
    }
    await whatsappBotService.routeVerifierReply(fila.restaurantId, texto);
    return;
  }

  // 2) ¿Imagen? Posible comprobante. El webhook la trae en base64 (base64:true); si no vino,
  // se le pide a Evolution por la key del mensaje.
  if (contenido.imageMessage) {
    let base64 = crudo.base64 as string | undefined;
    if (!base64) {
      base64 = (await evolution.mediaBase64(fila.instanceName, data.key).catch(() => ({ base64: undefined }))).base64;
    }
    if (!base64) return;
    const buffer = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
    if (restaurant.businessType === 'SPORTS_CLUB') {
      const handled = await whatsappBotService.procesarComprobanteDeudaClub(fila.restaurantId, phoneDigits, buffer);
      if (handled) return;
    }
    await whatsappBotService.procesarComprobantePedido(fila.restaurantId, phoneDigits, buffer);
  }

  // 3) Texto normal de un cliente: sin bienvenida a propósito (ver doc de arriba).
}
