import { z } from 'zod';

/** Validación de entrada para crear/actualizar productos. */
export const createProductSchema = z.object({
  categoryId: z.string().min(1, 'La categoría es obligatoria.'),
  // Estación de cocina donde se prepara (opcional). null = sin asignar.
  kitchenId: z.string().min(1).nullable().optional(),
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  description: z.string().max(500).optional(),
  price: z.coerce.number().nonnegative('El precio no puede ser negativo.'),
  // Costo para el margen de utilidad (Administración → Margen de utilidad).
  // "RECIPE" ignora costBase y usa la suma en vivo de la receta del producto.
  costSource: z.enum(['MANUAL', 'RECIPE']).optional().default('MANUAL'),
  costBase: z.coerce.number().nonnegative('El costo no puede ser negativo.').optional(),
  photoUrl: z.string().min(1).optional(),
  isAvailable: z.boolean().optional().default(true),
  // Tiempo aproximado de preparación, en minutos (informativo, opcional).
  prepTimeMinutes: z.coerce.number().int().min(0).max(600).optional(),

  // Banderas de marketing
  isStar: z.boolean().optional().default(false),
  isPromo: z.boolean().optional().default(false),
  isHouseSpecial: z.boolean().optional().default(false),

  priority: z.coerce.number().int().optional().default(0),
});

// En update todos los campos son opcionales.
export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
