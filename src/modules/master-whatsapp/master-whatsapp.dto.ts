import { z } from 'zod';

export const updateMasterWhatsappSettingsSchema = z.object({
  // null = borra el número y desactiva el reenvío de comprobantes de renovación.
  subscriptionVerifierPhone: z.string().max(30).nullable().optional(),
});

export type UpdateMasterWhatsappSettingsInput = z.infer<typeof updateMasterWhatsappSettingsSchema>;

/** Envío manual de un mensaje libre desde el bot de la plataforma — usado para avisos puntuales
 * al equipo (ej. previsualizar un anuncio en el número verificador antes de mandarlo a todos). */
export const sendMasterWhatsappMessageSchema = z.object({
  phone: z.string().min(6).max(30),
  message: z.string().min(1).max(4000),
});

export type SendMasterWhatsappMessageInput = z.infer<typeof sendMasterWhatsappMessageSchema>;
