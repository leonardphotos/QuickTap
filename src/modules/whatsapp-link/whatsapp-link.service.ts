import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http-error';
import { evolution } from '../../utils/evolution';

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
// Envíos seguidos sin ACK que activan la auto-pausa.
const MAX_SIN_ACK = 5;

const contadorHora = new Map<string, { desde: number; enviados: number }>();

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

  /**
   * Envía un texto por la instancia del negocio (o la de plataforma con null).
   * Devuelve false — sin tirar — cuando no se puede: el que llama SIEMPRE tiene su fallback
   * (el enlace wa.me de toda la vida), así que no enviar jamás debe romper una operación.
   */
  async enviar(restaurantId: string | null, telefono: string, texto: string): Promise<boolean> {
    if (!evolution.disponible()) return false;
    const fila = await instanciaDe(restaurantId);
    if (!fila || fila.status !== 'CONNECTED' || fila.paused || fila.autoPaused) return false;

    // Techo por hora, en memoria: exacto no hace falta, barato sí.
    const ahora = Date.now();
    const c = contadorHora.get(fila.id);
    if (!c || ahora - c.desde > 3600_000) contadorHora.set(fila.id, { desde: ahora, enviados: 0 });
    const cuenta = contadorHora.get(fila.id)!;
    if (cuenta.enviados >= MAX_POR_HORA) return false;

    const numero = telefono.replace(/\D/g, '').replace(/^0/, '58');
    try {
      await evolution.enviarTexto(fila.instanceName, numero.startsWith('58') ? numero : `58${numero}`, texto);
    } catch {
      return false;
    }
    cuenta.enviados += 1;

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
