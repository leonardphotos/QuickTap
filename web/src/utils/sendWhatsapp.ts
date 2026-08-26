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
  // 1) El WhatsApp VINCULADO del negocio (Evolution, ver Ajustes): el mensaje sale del número
  //    del propio local sin abrirle WhatsApp a nadie. Independiente de los chatbots viejos.
  //    Responde rápido (corre en el mismo VPS); cualquier fallo —plan sin el beneficio (403),
  //    instancia sin vincular (sent:false), Evolution caída— cae al siguiente paso.
  try {
    const res = await api.post('/whatsapp-link/send', { phone, message });
    if (res.data?.data?.sent) return true;
  } catch {
    // Sigue.
  }
  // 2) El chatbot viejo, solo si está encendido (hoy no: CHATBOTS_ENABLED=false).
  if (CHATBOTS_ENABLED) {
    try {
      const res = await api.post('/whatsapp-bot/send', { phone, message });
      if (res.data?.data?.sent) return true;
    } catch {
      // Sigue al fallback.
    }
  }
  // 3) El enlace wa.me de siempre: lo manda el staff a mano desde su propio WhatsApp.
  window.open(fallbackUrl, '_blank');
  return false;
}
