import { z } from 'zod';

export const createRecipeIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    preparationId: z.string().min(1).optional(),
    // Combos: la línea es otro plato entero con su propia receta (ver RecipeIngredient).
    componentProductId: z.string().min(1).optional(),
    // "A elección del cliente": en vez de un insumo/preparación fijo, el topping se resuelve
    // al servir según lo que el cliente eligió en esta categoría de modificadores.
    customerChoiceModifierCategoryId: z.string().min(1).optional(),
    // Porción propia para UN topping concreto de esa categoría (le gana a la línea genérica).
    // Requiere customerChoiceModifierCategoryId.
    customerChoiceModifierId: z.string().min(1).nullable().optional(),
    // Tamaño/variante al que aplica esta línea — null/ausente = aplica a todos los tamaños.
    productVariantId: z.string().min(1).nullable().optional(),
    // Cantidad del insumo/preparación (ya convertida a su unidad base, ej. kg o gr) que
    // usa una unidad del producto. El costo NUNCA viene del cliente: se calcula en el
    // service a partir del grafo de costeo (ver src/modules/inventory/costing.ts).
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  })
  .refine(
    (v) =>
      [v.inventoryItemId, v.preparationId, v.componentProductId, v.customerChoiceModifierCategoryId].filter(Boolean)
        .length === 1,
    { message: 'Elige un insumo, una preparación, otro plato o "A elección del cliente" — uno solo.' },
  )
  .refine((v) => !v.customerChoiceModifierId || Boolean(v.customerChoiceModifierCategoryId), {
    message: 'Un topping concreto necesita su categoría de modificadores.',
  });

export const updateRecipeIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    preparationId: z.string().min(1).optional(),
    customerChoiceModifierCategoryId: z.string().min(1).optional(),
    customerChoiceModifierId: z.string().min(1).nullable().optional(),
    productVariantId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.').optional(),
  })
  .refine(
    (v) => [v.inventoryItemId, v.preparationId, v.customerChoiceModifierCategoryId].filter(Boolean).length <= 1,
    { message: 'Elige un insumo, una preparación o "A elección del cliente" — uno solo.' },
  );

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

// Copiar la receta de un plato a otro (ver recipe.service.ts -> duplicate). `replace` es
// obligatorio para pisar una receta que ya existe: rearmarla puede ser trabajo de horas.
export const duplicateRecipeSchema = z.object({
  targetProductId: z.string().min(1, 'Elige el plato al que copiar la receta.'),
  replace: z.boolean().optional().default(false),
});

export type DuplicateRecipeInput = z.infer<typeof duplicateRecipeSchema>;

// Copiar los ingredientes de un tamaño a otro del MISMO plato (ver duplicateVariant).
// null en cualquiera de los dos = las líneas compartidas ("Todos los tamaños").
export const duplicateRecipeVariantSchema = z.object({
  fromVariantId: z.string().nullable().optional(),
  toVariantId: z.string().nullable().optional(),
  replace: z.boolean().optional().default(false),
});

export type DuplicateRecipeVariantInput = z.infer<typeof duplicateRecipeVariantSchema>;
