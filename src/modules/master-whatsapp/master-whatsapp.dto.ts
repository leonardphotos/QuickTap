import { z } from 'zod';

export const updateMasterWhatsappSettingsSchema = z.object({
  // null = borra el número y desactiva el reenvío de comprobantes de renovación.
  subscriptionVerifierPhone: z.string().max(30).nullable().optional(),
});

export type UpdateMasterWhatsappSettingsInput = z.infer<typeof updateMasterWhatsappSettingsSchema>;
