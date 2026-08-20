import { api } from '@/api/client';
import { CHATBOTS_ENABLED } from '@/config/features';

/**
 * Intenta mandar un mensaje de WhatsApp por el chatbot vinculado del restaurante (ver Ajustes
 * → WhatsApp). Si no está conectado (o falla), cae al enlace `wa.me` de siempre para que el
 * staff lo mande a mano desde su propio teléfono/WhatsApp Web — nunca bloquea la acción.
 *
 * @param phone Teléfono del destinatario (cliente, repartidor...), en cualquier formato.
 * @param message Texto ya armado del mensaje.
 * @param fallbackUrl Enlace `wa.me` de respaldo si el bot no está conectado.
 * @returns true si se mandó por el bot (mostrar "Mensaje enviado"), false si se usó el fallback.
 */
export async function sendWhatsappOrOpen(phone: string, message: string, fallbackUrl: string): Promise<boolean> {
  // Con los chatbots apagados no tiene sentido ni intentar el envío: se va directo al enlace,
  // sin la espera de una petición que se sabe que va a fallar.
  if (!CHATBOTS_ENABLED) {
    window.open(fallbackUrl, '_blank');
    return false;
  }
  try {
    const res = await api.post('/whatsapp-bot/send', { phone, message });
    if (res.data?.data?.sent) return true;
  } catch {
    // Sigue al fallback.
  }
  window.open(fallbackUrl, '_blank');
  return false;
}
