import { z } from 'zod';

export const createRecipeIngredientSchema = z.object({
  inventoryItemId: z.string().min(1, 'Elige un insumo.'),
  // Cantidad del insumo (ya convertida a su propia unidad, ej. kg) que usa una
  // unidad del producto. El costo NUNCA viene del cliente: se calcula en el
  // service a partir de `inventoryItem.pricePerUnitBase * quantity`.
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

export const updateRecipeIngredientSchema = createRecipeIngredientSchema.partial();

export type CreateRecipeIngredientInput = z.infer<typeof createRecipeIngredientSchema>;
export type UpdateRecipeIngredientInput = z.infer<typeof updateRecipeIngredientSchema>;
