import { z } from 'zod';

export const updateWhatsappBotSettingsSchema = z.object({
  notifyReceived: z.boolean().optional(),
  notifyReady: z.boolean().optional(),
  welcomeEnabled: z.boolean().optional(),
  // null = borrar la personalización y volver a DEFAULT_WELCOME_TEMPLATE.
  welcomeMessage: z.string().max(1000).nullable().optional(),
});

export type UpdateWhatsappBotSettingsInput = z.infer<typeof updateWhatsappBotSettingsSchema>;
