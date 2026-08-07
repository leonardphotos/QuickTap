import { z } from 'zod';

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
  // No nulo = este insumo queda disponible para vincularse como envase de un producto.
  packagingType: z.enum(['ENVASE', 'CAJA', 'BOLSA']).nullable().optional(),
  // Precio que se le cobra al cliente por unidad de envase (solo aplica junto a packagingType).
  salePrice: z.coerce.number().nonnegative('El precio de venta no puede ser negativo.').nullable().optional(),
  // "LOCAL" (de siempre) = insumo normal de esta sede; "CASA_MATRIZ" = ventana aparte,
  // solo disponible en la sede principal cuando Restaurant.casaMatrizEnabled está activo.
  locationScope: z.enum(['LOCAL', 'CASA_MATRIZ']).optional().default('LOCAL'),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

// GET /inventory?locationScope=... — qué ventana de insumos se está listando.
export const listInventoryQuerySchema = z.object({
  locationScope: z.enum(['LOCAL', 'CASA_MATRIZ']).optional().default('LOCAL'),
});

export const bulkDeleteInventoryItemsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecciona al menos un insumo.'),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type BulkDeleteInventoryItemsInput = z.infer<typeof bulkDeleteInventoryItemsSchema>;
