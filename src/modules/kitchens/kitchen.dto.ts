import { z } from 'zod';

export const createKitchenSchema = z.object({
  name: z.string().min(1).max(60),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateKitchenSchema = createKitchenSchema.partial();

export type CreateKitchenInput = z.infer<typeof createKitchenSchema>;
export type UpdateKitchenInput = z.infer<typeof updateKitchenSchema>;
