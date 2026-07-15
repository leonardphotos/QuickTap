import { z } from 'zod';

const durationUnitSchema = z.enum(['HOUR', 'DAY', 'MONTH', 'YEAR']);

export const createPromoCodeSchema = z.object({
  code: z
    .string()
    .min(3, 'El código debe tener al menos 3 caracteres.')
    .max(40)
    .transform((v) => v.trim().toUpperCase()),
  discountPercent: z.coerce.number().int().min(10, 'Mínimo 10%.').max(100, 'Máximo 100%.'),
  // Vencimiento opcional: si se envían ambos, el backend calcula expiresAt = ahora + duración.
  durationValue: z.coerce.number().int().min(1).optional(),
  durationUnit: durationUnitSchema.optional(),
});

export const updatePromoCodeSchema = z.object({
  discountPercent: z.coerce.number().int().min(10).max(100).optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>;
