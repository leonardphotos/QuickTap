import { z } from 'zod';

export const createTableSchema = z.object({
  number: z.string().min(1).max(40),
  zoneId: z.string().min(1).optional(),
});

// A diferencia de create, permite enviar `zoneId: null` explícito para quitar
// la mesa de su zona actual (createTableSchema.partial() no distinguiría
// "no lo toques" de "quítale la zona").
export const updateTableSchema = z.object({
  number: z.string().min(1).max(40).optional(),
  zoneId: z.string().min(1).nullable().optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
