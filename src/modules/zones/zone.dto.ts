import { z } from 'zod';

export const createZoneSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(80),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateZoneSchema = createZoneSchema.partial();

export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
