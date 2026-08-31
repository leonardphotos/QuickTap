/**
 * Interruptores de funciones que se apagan enteras, sin borrar el código.
 */

/**
 * Chatbots de WhatsApp: el de la plataforma (cobranza), el de cada restaurante y el de deudas
 * de clubes. Apagado desde el 20/08/2026.
 *
 * El motivo: la cuenta del bot de la plataforma acepta la conexión pero WhatsApp nunca acusa
 * recibo de sus envíos, así que los mensajes no llegan a nadie. Todo apunta a que WhatsApp
 * restringe la cuenta por envío automatizado, algo esperable porque la librería que usamos
 * (Baileys) no es oficial. Se apaga entero mientras se migra a la API oficial de WhatsApp
 * Business, en vez de dejar bots que aparentan funcionar y no entregan.
 *
 * Apagado NO rompe nada: donde el bot enviaba, la interfaz cae sola al enlace `wa.me` para
 * mandar el mensaje a mano (ver web/src/utils/sendWhatsapp.ts), y el cobro de mensualidad se
 * copia y se pega (ver subscription-reminder.service.ts#previewMessage).
 *
 * Para reactivarlo: poner esto en true acá y en web/src/config/features.ts, y desplegar. El
 * código, las sesiones guardadas y las tablas siguen intactos.
 */
export const CHATBOTS_ENABLED = false;

/**
 * Retoque de fotos con IA (Mejorar con IA / Fondo blanco con IA). Apagado desde el 31/08/2026
 * a pedido, sin motivo técnico: la función se saca de circulación por ahora.
 *
 * Se apaga también acá y no solo en el panel a propósito. Los botones desaparecen de la
 * interfaz, pero /ai-photo/* seguiría atendiendo a cualquier pestaña vieja que quedara abierta
 * —y cada llamada sale hacia el servicio de IA—, así que apagar solo la vista dejaría el gasto
 * corriendo por una puerta que ya nadie ve.
 *
 * Para reactivarlo: poner esto en true acá y en web/src/config/features.ts, y desplegar.
 */
export const AI_PHOTO_ENABLED = false;
