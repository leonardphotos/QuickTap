import { z } from 'zod';

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'windows']),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
