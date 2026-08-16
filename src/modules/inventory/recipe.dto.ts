import { z } from 'zod';

export const createRecipeIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    preparationId: z.string().min(1).optional(),
    // Cantidad del insumo/preparación (ya convertida a su unidad base, ej. kg o gr) que
    // usa una unidad del producto. El costo NUNCA viene del cliente: se calcula en el
    // service a partir del grafo de costeo (ver src/modules/inventory/costing.ts).
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  })
  .refine((v) => Boolean(v.inventoryItemId) !== Boolean(v.preparationId), {
    message: 'Elige un insumo o una preparación, no ambos.',
  });

export const updateRecipeIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    preparationId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.').optional(),
  })
  .refine((v) => !(v.inventoryItemId && v.preparationId), {
    message: 'Elige un insumo o una preparación, no ambos.',
  });

// PATCH /inventory/recipes/:productId/cascade — resguardo %, food cost objetivo % y los
// interruptores de servicio/IVA de la cascada de precio sugerido. Los PORCENTAJES de
// servicio/IVA siguen saliendo de la config real del restaurante; acá solo se decide si
// este producto los suma o no a su PVP sugerido (ver recipe.service.ts#getCascade).
export const updateCascadeConfigSchema = z.object({
  recipeBufferPercent: z.coerce.number().min(0, 'El resguardo no puede ser negativo.').optional(),
  recipeTargetFoodCostPercent: z.coerce
    .number()
    .positive('El food cost objetivo debe ser mayor a 0%.')
    .max(100, 'El food cost objetivo no puede superar 100%.')
    .optional(),
  recipeApplyService: z.boolean().optional(),
  recipeApplyIva: z.boolean().optional(),
  // Observaciones de la receta (técnica, emplatado, alérgenos). "" o null la borran.
  recipeNotes: z.string().trim().max(3000, 'Las observaciones no pueden pasar de 3000 caracteres.').nullable().optional(),
});

export type CreateRecipeIngredientInput = z.infer<typeof createRecipeIngredientSchema>;
export type UpdateRecipeIngredientInput = z.infer<typeof updateRecipeIngredientSchema>;
export type UpdateCascadeConfigInput = z.infer<typeof updateCascadeConfigSchema>;
