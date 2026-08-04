import { z } from 'zod';

export const updateWhatsappBotSettingsSchema = z.object({
  notifyReceived: z.boolean().optional(),
  notifyReady: z.boolean().optional(),
  welcomeEnabled: z.boolean().optional(),
  // null = borrar la personalización y volver a DEFAULT_WELCOME_TEMPLATE.
  welcomeMessage: z.string().max(1000).nullable().optional(),
  // null = desactiva el flujo de verificación de pago con comprobante (ver
  // order-payment-verification.service.ts).
  paymentVerifierPhone: z.string().max(30).nullable().optional(),
  // 'PAYMENT_VERIFICATION' (de siempre) = solo pide comprobante en métodos que lo exigen.
  // 'FULL_ORDER' = manda el pedido completo a paymentVerifierPhone para confirmación manual.
  orderMode: z.enum(['PAYMENT_VERIFICATION', 'FULL_ORDER']).optional(),
});

export type UpdateWhatsappBotSettingsInput = z.infer<typeof updateWhatsappBotSettingsSchema>;

// POST /whatsapp-bot/send — botones "Enviar por WhatsApp" del panel (comanda, cotización,
// recordatorio de cobro, recibo, etc.): mandan el mensaje ya armado por la sesión vinculada.
export const sendWhatsappMessageSchema = z.object({
  phone: z.string().min(1, 'Falta el teléfono del destinatario.').max(40),
  message: z.string().min(1, 'El mensaje no puede estar vacío.').max(4000),
});

export type SendWhatsappMessageInput = z.infer<typeof sendWhatsappMessageSchema>;
