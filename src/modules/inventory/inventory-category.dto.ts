import { z } from 'zod';

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(80),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateInventoryCategorySchema = createInventoryCategorySchema.partial();

export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryInput = z.infer<typeof updateInventoryCategorySchema>;

/** Asignación masiva: mover varios insumos a una categoría (o quitársela con null). */
export const bulkAssignCategorySchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'Elige al menos un insumo.').max(500),
  categoryId: z.string().min(1).nullable(),
});
export type BulkAssignCategoryInput = z.infer<typeof bulkAssignCategorySchema>;
