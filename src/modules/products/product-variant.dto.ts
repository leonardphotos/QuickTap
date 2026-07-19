import { z } from 'zod';

export const createProductVariantSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  priceBase: z.coerce.number().nonnegative(),
  packagingFeeBase: z.coerce.number().nonnegative().optional(),
  costBase: z.coerce.number().nonnegative().optional(),
  discountBase: z.coerce.number().nonnegative().optional(),
  isAvailable: z.boolean().optional().default(true),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateProductVariantSchema = createProductVariantSchema.partial();

export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
