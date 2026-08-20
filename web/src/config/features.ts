/**
 * Interruptores de funciones que se apagan enteras, sin borrar el código.
 * Espejo manual de src/config/features.ts en el backend — cambiar los dos juntos.
 */

/**
 * Chatbots de WhatsApp y chat de soporte del panel. Apagados desde el 20/08/2026.
 *
 * El motivo: la cuenta del bot de la plataforma acepta la conexión pero WhatsApp nunca acusa
 * recibo de sus envíos, así que los mensajes no llegan a nadie. Todo apunta a que WhatsApp
 * restringe la cuenta por envío automatizado, esperable porque la librería que usamos (Baileys)
 * no es oficial. Se apaga entero mientras se migra a la API oficial de WhatsApp Business, en
 * vez de dejar botones que aparentan funcionar y no entregan.
 *
 * Apagado NO rompe nada: donde el bot enviaba, la interfaz cae sola al enlace `wa.me` para
 * mandarlo a mano (ver utils/sendWhatsapp.ts), y el cobro de mensualidad se copia y se pega.
 *
 * Para reactivarlo: poner esto en true acá y en src/config/features.ts del backend.
 */
export const CHATBOTS_ENABLED = false;
