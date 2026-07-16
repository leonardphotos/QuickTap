import { z } from 'zod';

/** Botón "Añadir movimiento" en Administración → Resumen: ingreso/egreso/propina manual. */
export const createMovementSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amountBase: z.coerce.number().positive().max(1000000),
  description: z.string().min(1, 'Escribe una descripción.').max(200),
});

/** Filtro de rango, igual que el resto de Administración. */
export const movementQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('day'),
});

export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
