import { z } from 'zod';

export const updateWhatsappBotSettingsSchema = z.object({
  notifyReceived: z.boolean().optional(),
  notifyReady: z.boolean().optional(),
  welcomeEnabled: z.boolean().optional(),
  // null = borrar la personalización y volver a DEFAULT_WELCOME_TEMPLATE.
  welcomeMessage: z.string().max(1000).nullable().optional(),
});

export type UpdateWhatsappBotSettingsInput = z.infer<typeof updateWhatsappBotSettingsSchema>;

// POST /whatsapp-bot/send — botones "Enviar por WhatsApp" del panel (comanda, cotización,
// recordatorio de cobro, recibo, etc.): mandan el mensaje ya armado por la sesión vinculada.
export const sendWhatsappMessageSchema = z.object({
  phone: z.string().min(1, 'Falta el teléfono del destinatario.').max(40),
  message: z.string().min(1, 'El mensaje no puede estar vacío.').max(4000),
});

export type SendWhatsappMessageInput = z.infer<typeof sendWhatsappMessageSchema>;
