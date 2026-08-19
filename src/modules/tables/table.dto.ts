import { z } from 'zod';

export const createTableSchema = z.object({
  number: z.string().min(1).max(40),
  zoneId: z.string().min(1).optional(),
  seats: z.coerce.number().int().min(1).max(20).optional(),
});

// A diferencia de create, permite enviar `zoneId: null` explícito para quitar
// la mesa de su zona actual (createTableSchema.partial() no distinguiría
// "no lo toques" de "quítale la zona").
export const updateTableSchema = z.object({
  number: z.string().min(1).max(40).optional(),
  zoneId: z.string().min(1).nullable().optional(),
  seats: z.coerce.number().int().min(1).max(20).optional(),
});

/**
 * PATCH /tables/floor-plan — guarda de una sola vez la ubicación de las mesas que se
 * movieron en el plano. Posición en % del lienzo (0-100) para que el plano se vea igual en
 * cualquier pantalla; `planX: null` saca la mesa del plano y la devuelve a "sin ubicar".
 */
export const saveFloorPlanSchema = z.object({
  tables: z
    .array(
      z.object({
        id: z.string().min(1),
        planX: z.number().min(0).max(100).nullable(),
        planY: z.number().min(0).max(100).nullable(),
        planShape: z.enum(['ROUND', 'SQUARE', 'RECTANGLE']).optional(),
        planSize: z.number().min(0.6).max(2).optional(),
        seats: z.number().int().min(1).max(20).optional(),
      }),
    )
    .max(300),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type SaveFloorPlanInput = z.infer<typeof saveFloorPlanSchema>;
