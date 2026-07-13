import { z } from 'zod';

export const createPromoCodeSchema = z.object({
  code: z
    .string()
    .min(3, 'El código debe tener al menos 3 caracteres.')
    .max(40)
    .transform((v) => v.trim().toUpperCase()),
  discountPercent: z.coerce.number().int().min(10, 'Mínimo 10%.').max(100, 'Máximo 100%.'),
});

export const updatePromoCodeSchema = z.object({
  discountPercent: z.coerce.number().int().min(10).max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;
