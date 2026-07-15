import { z } from 'zod';

export const createRecipeIngredientSchema = z.object({
  inventoryItemId: z.string().min(1, 'Elige un insumo.'),
  // Cantidad del insumo (en su propia unidad, ej. kg) que usa una unidad del producto.
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  costBase: z.coerce.number().nonnegative('El costo no puede ser negativo.'),
});

export const updateRecipeIngredientSchema = createRecipeIngredientSchema.partial();

export type CreateRecipeIngredientInput = z.infer<typeof createRecipeIngredientSchema>;
export type UpdateRecipeIngredientInput = z.infer<typeof updateRecipeIngredientSchema>;
