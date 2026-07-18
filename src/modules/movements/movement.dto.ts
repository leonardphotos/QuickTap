import { z } from 'zod';

const EXPENSE_CATEGORIES = [
  'UTILITIES',
  'SUPPLIES',
  'RENT',
  'PAYROLL',
  'ADMINISTRATIVE',
  'MARKETING',
  'TRANSPORT',
  'MAINTENANCE',
  'FURNITURE',
  'OTHER',
] as const;

/** Botón "Añadir movimiento" en Administración → Resumen: ingreso/egreso/propina manual.
 * También cubre el módulo de Gastos: categoría, proveedor, reabastecimiento de inventario y crédito. */
export const createMovementSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amountBase: z.coerce.number().positive().max(1000000),
    description: z.string().min(1, 'Escribe una descripción.').max(200),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    supplierId: z.string().optional(),
    // Si viene, además de registrar el gasto suma `inventoryQuantity` al insumo.
    inventoryItemId: z.string().optional(),
    inventoryQuantity: z.coerce.number().positive().optional(),
    // Gasto tomado a crédito con el proveedor: queda pendiente por pagar.
    isCredit: z.boolean().optional().default(false),
  })
  .refine((v) => !v.inventoryItemId || v.inventoryQuantity != null, {
    message: 'Indica la cantidad recibida del insumo.',
    path: ['inventoryQuantity'],
  });

/** Filtro de rango, igual que el resto de Administración. */
export const movementQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('day'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // "Pendientes con proveedores": ignora range/date, muestra todo lo que sigue a crédito sin pagar.
  onlyPendingCredit: z.coerce.boolean().optional(),
});

export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
