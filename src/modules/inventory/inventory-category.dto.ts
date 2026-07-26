import { z } from 'zod';

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(80),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateInventoryCategorySchema = createInventoryCategorySchema.partial();

export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryInput = z.infer<typeof updateInventoryCategorySchema>;
