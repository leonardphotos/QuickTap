import { z } from 'zod';

/** "YYYY-MM-DD" en hora de Caracas. Cadena vacía = se está borrando la fecha. */
const expiryDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de caducidad debe tener formato YYYY-MM-DD.')
  .or(z.literal(''))
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/** Igual que arriba pero OBLIGATORIA: al crear un insumo la fecha de caducidad no puede faltar. */
const requiredExpiryDate = z
  .string({ required_error: 'La fecha de caducidad es obligatoria.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de caducidad es obligatoria (formato YYYY-MM-DD).');

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  unit: z.enum(['kg', 'lt', 'ml', 'unidad']),
  quantity: z.coerce.number().nonnegative().default(0),
  minQuantity: z.coerce.number().nonnegative().default(0),
  // Costo de la cantidad cargada (no por unidad): ej. "5 kg costaron 15000 Bs".
  // El service divide por `quantity` para obtener el costo por unidad.
  price: z.coerce.number().nonnegative().optional(),
  priceCurrency: z.enum(['BASE', 'BS']).optional().default('BASE'),
  photoUrl: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  // Fecha de caducidad del lote en stock — obligatoria al crear (los insumos viejos que
  // no la tienen se pueden editar igual: updateInventoryItemSchema la deja opcional).
  expiryDate: requiredExpiryDate,
  // No nulo = este insumo queda disponible para vincularse como envase de un producto.
  packagingType: z.enum(['ENVASE', 'CAJA', 'BOLSA']).nullable().optional(),
  // Precio que se le cobra al cliente por unidad de envase (solo aplica junto a packagingType).
  salePrice: z.coerce.number().nonnegative('El precio de venta no puede ser negativo.').nullable().optional(),
  // "LOCAL" (de siempre) = insumo normal de esta sede; "CASA_MATRIZ" = ventana aparte,
  // solo disponible en la sede principal cuando Restaurant.casaMatrizEnabled está activo.
  locationScope: z.enum(['LOCAL', 'CASA_MATRIZ']).optional().default('LOCAL'),
  // % aprovechable tras merma/limpieza y % de colchón por fluctuación de precio — ajustan
  // el costo real que usan recetas y preparaciones (ver src/modules/inventory/costing.ts).
  yieldPercent: z.coerce.number().positive('El rendimiento debe ser mayor a 0.').max(100, 'El rendimiento no puede superar 100%.').optional(),
  correctionPercent: z.coerce.number().min(0, 'El factor de corrección no puede ser negativo.').optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial().extend({ expiryDate });

// GET /inventory?locationScope=... — qué ventana de insumos se está listando.
export const listInventoryQuerySchema = z.object({
  locationScope: z.enum(['LOCAL', 'CASA_MATRIZ']).optional().default('LOCAL'),
});

/** GET /inventory/alerts?days=30 — ventana de "pronto a vencerse". */
export const inventoryAlertsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  locationScope: z.enum(['LOCAL', 'CASA_MATRIZ']).optional().default('LOCAL'),
});

export const bulkDeleteInventoryItemsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecciona al menos un insumo.'),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type InventoryAlertsQuery = z.infer<typeof inventoryAlertsQuerySchema>;
export type BulkDeleteInventoryItemsInput = z.infer<typeof bulkDeleteInventoryItemsSchema>;
