import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  priority: z.coerce.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
