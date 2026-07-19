import { z } from 'zod';

export const createModifierCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(150),
  isRequired: z.boolean().optional().default(false),
  allowMultiple: z.boolean().optional().default(false),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateModifierCategorySchema = createModifierCategorySchema.partial();

export const createModifierSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  priceBase: z.coerce.number().nonnegative().optional().default(0),
  costBase: z.coerce.number().nonnegative().optional(),
  discountBase: z.coerce.number().nonnegative().optional(),
  isAvailable: z.boolean().optional().default(true),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateModifierSchema = createModifierSchema.partial();

export const associateProductSchema = z.object({
  productId: z.string().min(1),
});

export type CreateModifierCategoryInput = z.infer<typeof createModifierCategorySchema>;
export type UpdateModifierCategoryInput = z.infer<typeof updateModifierCategorySchema>;
export type CreateModifierInput = z.infer<typeof createModifierSchema>;
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;
export type AssociateProductInput = z.infer<typeof associateProductSchema>;
