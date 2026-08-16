import { z } from 'zod';

/** Un elemento fijo o variable del restaurante, como % del precio de venta. */
export const costStructureItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1, 'El nombre es obligatorio.').max(80),
  kind: z.enum(['FIXED', 'VARIABLE']),
  percent: z.coerce.number().min(0, 'El % no puede ser negativo.').max(100, 'El % no puede pasar de 100.'),
  enabled: z.boolean(),
});

export const updateCostStructureConfigSchema = z.object({
  items: z.array(costStructureItemSchema).max(40, 'Demasiados elementos.'),
  targetNetMarginPercent: z.coerce.number().min(0).max(95),
});
export type UpdateCostStructureConfigInput = z.infer<typeof updateCostStructureConfigSchema>;

/** Línea de material utilizado. El costo total se recalcula en el servidor (cantidad × unitario). */
export const materialLineSchema = z.object({
  name: z.string().trim().min(1, 'El material necesita un nombre.').max(120),
  quantity: z.coerce.number().min(0),
  unit: z.string().trim().max(20).default('und'),
  unitCost: z.coerce.number().min(0),
  inventoryItemId: z.string().min(1).nullable().optional(),
  preparationId: z.string().min(1).nullable().optional(),
});

export const saveProductCostStructureSchema = z.object({
  materials: z.array(materialLineSchema).max(100),
  salePriceBase: z.coerce.number().min(0),
  // Si viene true y el producto usa costo manual, además actualiza Product.costBase con la
  // materia prima — así el Margen de utilidad y el KPI leen el mismo número que la calculadora.
  syncProductCost: z.boolean().optional().default(false),
});
export type SaveProductCostStructureInput = z.infer<typeof saveProductCostStructureSchema>;

export const rangeQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year']).default('month'),
});
