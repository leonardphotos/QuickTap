import { z } from 'zod';

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  unit: z.enum(['kg', 'lt', 'ml', 'unidad']),
  quantity: z.coerce.number().nonnegative().default(0),
  minQuantity: z.coerce.number().nonnegative().default(0),
  // Costo de la cantidad cargada (no por unidad): ej. "5 kg costaron 15000 Bs".
  // El service divide por `quantity` para obtener el costo por unidad.
  price: z.coerce.number().nonnegative().optional(),
  priceCurrency: z.enum(['BASE', 'BS']).optional().default('BASE'),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
