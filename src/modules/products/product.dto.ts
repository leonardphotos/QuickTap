import { z } from 'zod';

/** Validación de entrada para crear/actualizar productos. */
export const createProductSchema = z.object({
  categoryId: z.string().min(1, 'La categoría es obligatoria.'),
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  description: z.string().max(500).optional(),
  price: z.coerce.number().nonnegative('El precio no puede ser negativo.'),
  photoUrl: z.string().url('La foto debe ser una URL válida.').optional(),
  isAvailable: z.boolean().optional().default(true),

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
