import { z } from 'zod';

export const WASTE_REASONS = [
  'EXPIRED',
  'DAMAGED',
  'PREPARATION',
  'CUSTOMER_RETURN',
  'SPILLAGE',
  'THEFT',
  // Normalmente se genera sola al reabastecer (ver movement.service.ts); se acepta también
  // manual por si alguien quiere anotar una pérdida de rendimiento puntual.
  'YIELD_LOSS',
  'OTHER',
] as const;

/**
 * Registrar una merma. El COSTO nunca viene del cliente: lo resuelve el service con el costo
 * vivo del insumo (grafo de costeo, igual que las recetas) o del producto — si lo mandara el
 * navegador, cualquiera podría inflar o esconder la merma del período.
 */
export const createWasteSchema = z
  .object({
    inventoryItemId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.').max(1000000),
    reason: z.enum(WASTE_REASONS),
    note: z.string().trim().max(300).optional(),
    // Fecha real de la merma (por defecto hoy). Solo la fecha, sin hora.
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
      .optional(),
    // Descontar la existencia. Por defecto sí: si se botó, ya no está en la nevera.
    adjustStock: z.boolean().optional().default(true),
  })
  .refine((v) => Boolean(v.inventoryItemId) !== Boolean(v.productId), {
    message: 'Elige un insumo o un producto, no ambos.',
  });
export type CreateWasteInput = z.infer<typeof createWasteSchema>;

export const wasteQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).default('month'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
