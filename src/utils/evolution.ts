import { env } from '../config/env';

/**
 * Cliente mínimo de Evolution API (https://github.com/evolution-foundation/evolution-api),
 * corriendo en este mismo VPS bajo PM2, solo en localhost — nunca expuesto a internet: el
 * único que le habla es este backend.
 *
 * Cada negocio vincula SU número (una "instancia" de Evolution por restaurante). La lección
 * de agosto 2026 está en el diseño: aquel bloqueo fue un único número de plataforma enviando
 * cobranzas; acá el riesgo se reparte y un número restringido tumba a un local, no a todos.
 */

function config() {
  if (!env.evolution.baseUrl || !env.evolution.apiKey) {
    throw new Error('Evolution API no está configurada (EVOLUTION_BASE_URL / EVOLUTION_API_KEY).');
  }
  return { base: env.evolution.baseUrl.replace(/\/$/, ''), key: env.evolution.apiKey };
}

async function llamar<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { base, key } = config();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Evolution vive en localhost: si tarda, está caída — mejor cortar que colgar el panel.
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as T & { message?: unknown };
  if (!res.ok) {
    throw new Error(`Evolution ${method} ${path} → ${res.status}: ${JSON.stringify(data?.message ?? data).slice(0, 300)}`);
  }
  return data;
}

export const evolution = {
  disponible(): boolean {
    return !!env.evolution.baseUrl && !!env.evolution.apiKey;
  },

  /** Crea la instancia y deja configurado su webhook hacia nosotros. Idempotente por nombre. */
  async crearInstancia(instanceName: string, webhookUrl: string) {
    return llamar('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        // Estado de conexión + ACKs (el detector de números restringidos) + MESSAGES_UPSERT:
        // lo entrante — el "Aprobado" del verificador y la foto del comprobante, que es lo
        // que hace funcionar la verificación de pagos. base64:true: la imagen llega embebida
        // en el evento y no hay que ir a buscarla aparte.
        events: ['CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'MESSAGES_UPSERT'],
        base64: true,
      },
    });
  },

  /** El QR vigente para vincular (Evolution lo rota solo cada ~40s). */
  async qr(instanceName: string): Promise<{ base64?: string; code?: string; count?: number }> {
    return llamar('GET', `/instance/connect/${instanceName}`);
  },

  async estado(instanceName: string): Promise<{ instance?: { state?: string } }> {
    return llamar('GET', `/instance/connectionState/${instanceName}`);
  },

  /** Desvincula el número (cierra sesión de WhatsApp) sin borrar la instancia. */
  async logout(instanceName: string) {
    return llamar('DELETE', `/instance/logout/${instanceName}`);
  },

  async borrarInstancia(instanceName: string) {
    return llamar('DELETE', `/instance/delete/${instanceName}`);
  },

  /** Envía texto plano. El número va en dígitos internacionales (58414...). */
  async enviarTexto(instanceName: string, numero: string, texto: string): Promise<{ key?: { id?: string } }> {
    return llamar('POST', `/message/sendText/${instanceName}`, { number: numero, text: texto });
  },

  /** Envía una imagen (base64) con pie de foto opcional — el comprobante reenviado al verificador. */
  async enviarImagen(instanceName: string, numero: string, base64: string, caption?: string): Promise<unknown> {
    return llamar('POST', `/message/sendMedia/${instanceName}`, {
      number: numero,
      mediatype: 'image',
      mimetype: 'image/jpeg',
      media: base64,
      caption: caption ?? '',
      fileName: 'comprobante.jpg',
    });
  },

  /** Reconfigura el webhook de una instancia YA creada — para sumarle eventos (p. ej.
   * mensajes entrantes) a instancias que nacieron antes de que los escucháramos. */
  async setWebhook(instanceName: string, url: string, events: string[]) {
    return llamar('POST', `/webhook/set/${instanceName}`, {
      webhook: { enabled: true, url, events, base64: true, byEvents: false },
    });
  },

  /** Descarga el contenido (base64) de un mensaje con media, por su key — el plan B cuando el
   * webhook no trajo el base64 embebido. */
  async mediaBase64(instanceName: string, messageKey: unknown): Promise<{ base64?: string }> {
    return llamar('POST', `/chat/getBase64FromMediaMessage/${instanceName}`, {
      message: { key: messageKey },
      convertToMp4: false,
    });
  },
};
