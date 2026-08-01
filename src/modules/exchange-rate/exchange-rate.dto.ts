import { z } from 'zod';

export const setManualRateSchema = z.object({
  manual: z.boolean(),
  rateBs: z.number().positive().optional(),
});

export type SetManualRateInput = z.infer<typeof setManualRateSchema>;
