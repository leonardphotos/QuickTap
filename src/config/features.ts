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
