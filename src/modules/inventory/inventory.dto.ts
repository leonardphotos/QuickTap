import { z } from 'zod';

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  unit: z.string().min(1, 'La unidad es obligatoria.').max(20),
  quantity: z.coerce.number().nonnegative().default(0),
  minQuantity: z.coerce.number().nonnegative().default(0),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
