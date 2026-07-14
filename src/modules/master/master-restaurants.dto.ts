import { z } from 'zod';

export const setSuspendedSchema = z.object({
  suspended: z.boolean(),
});

export type SetSuspendedInput = z.infer<typeof setSuspendedSchema>;

export const extendDaysSchema = z.object({
  days: z.coerce.number().int().min(-3650).max(3650),
});

export type ExtendDaysInput = z.infer<typeof extendDaysSchema>;
