import { z } from 'zod';

export const updateWhatsappBotSettingsSchema = z.object({
  notifyReceived: z.boolean().optional(),
  notifyReady: z.boolean().optional(),
});

export type UpdateWhatsappBotSettingsInput = z.infer<typeof updateWhatsappBotSettingsSchema>;
