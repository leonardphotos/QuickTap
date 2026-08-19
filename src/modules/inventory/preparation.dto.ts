import { z } from 'zod';

export const createPreparationSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  // "kg" | "lt" — una preparación siempre se mide en peso/volumen, nunca "unidad".
  unit: z.enum(['kg', 'lt']),
  // Cuánto rinde, en la unidad declarada arriba (kg/lt) — gr/ml son solo la conveniencia
  // de entrada en la UI, convertidos antes de llamar a este endpoint.
  yieldQuantity: z.coerce.number().positive('El rendimiento debe ser mayor a 0.'),
  // Topping multi-insumo (ver Preparation.isTopping) — curada para el picker de
  // Inventario → Toppings al crear un modificador desde ahí.
  isTopping: z.boolean().optional(),
});

export const updatePreparationSchema = createPreparationSchema.partial();

export const createPreparationIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    componentPreparationId: z.string().min(1).optional(),
    // En la unidad propia del ingrediente referenciado (kg/lt/unidad). El costo NUNCA viene
    // del cliente: se calcula en el service a partir del grafo de costeo.
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  })
  .refine((v) => Boolean(v.inventoryItemId) !== Boolean(v.componentPreparationId), {
    message: 'Elige un insumo o una preparación, no ambos.',
  });

export const updatePreparationIngredientSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    componentPreparationId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.').optional(),
  })
  .refine((v) => !(v.inventoryItemId && v.componentPreparationId), {
    message: 'Elige un insumo o una preparación, no ambos.',
  });

export type CreatePreparationInput = z.infer<typeof createPreparationSchema>;
export type UpdatePreparationInput = z.infer<typeof updatePreparationSchema>;
export type CreatePreparationIngredientInput = z.infer<typeof createPreparationIngredientSchema>;
export type UpdatePreparationIngredientInput = z.infer<typeof updatePreparationIngredientSchema>;
