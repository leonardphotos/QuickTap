import { z } from 'zod';

/** Filtro de período para Administración → Margen de utilidad (margen sobre lo realmente vendido). */
export const marginReportQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('month'),
  // Fecha exacta ("YYYY-MM-DD"): si viene, ignora `range` y filtra ese día completo.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const bulkDeleteProductsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecciona al menos un producto.'),
});
export type BulkDeleteProductsInput = z.infer<typeof bulkDeleteProductsSchema>;

/** Validación de entrada para crear/actualizar productos. */
export const createProductSchema = z.object({
  categoryId: z.string().min(1, 'La categoría es obligatoria.'),
  // Estación de cocina donde se prepara (opcional). null = sin asignar.
  kitchenId: z.string().min(1).nullable().optional(),
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  description: z.string().max(500).optional(),
  price: z.coerce.number().nonnegative('El precio no puede ser negativo.'),
  // "SIMPLE" = precio único (el campo `price`); "VARIANTS" = el cliente elige entre
  // las filas de ProductVariant, cada una con su propio precio.
  pricingMode: z.enum(['SIMPLE', 'VARIANTS']).optional().default('SIMPLE'),
  // Costo para el margen de utilidad (Administración → Margen de utilidad).
  // "RECIPE" ignora costBase y usa la suma en vivo de la receta del producto.
  costSource: z.enum(['MANUAL', 'RECIPE']).optional().default('MANUAL'),
  costBase: z.coerce.number().nonnegative('El costo no puede ser negativo.').optional(),
  // null = borrar la foto existente; undefined/ausente = no tocarla.
  photoUrl: z.string().min(1).nullable().optional(),
  isAvailable: z.boolean().optional().default(true),
  // Tiempo aproximado de preparación, en minutos (informativo, opcional).
  prepTimeMinutes: z.coerce.number().int().min(0).max(600).optional(),
  // Código interno opcional (back-office). Nunca se expone en el menú público.
  sku: z.string().max(60).nullable().optional(),
  // Control de stock simple por producto. stockQuantity null = sin control de stock.
  stockControlEnabled: z.boolean().optional().default(false),
  stockQuantity: z.coerce.number().int().min(0).nullable().optional(),
  // A partir de cuántas unidades avisar "por agotarse" (Inventario → Alertas).
  stockMinQuantity: z.coerce.number().int().min(0).nullable().optional(),
  // Fecha de caducidad "YYYY-MM-DD" (hora de Caracas). Cadena vacía = se borra.
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de caducidad debe tener formato YYYY-MM-DD.')
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),

  // Envase: solo se cobra en pedidos DELIVERY/PICKUP. "FIXED" usa packagingFeeBase;
  // "INVENTORY" usa el precio de venta del insumo vinculado (packagingItemId).
  packagingMode: z.enum(['NONE', 'FIXED', 'INVENTORY']).optional().default('NONE'),
  packagingFeeBase: z.coerce.number().nonnegative('El precio de envase no puede ser negativo.').nullable().optional(),
  packagingItemId: z.string().min(1).nullable().optional(),

  // Banderas de marketing
  isStar: z.boolean().optional().default(false),
  isPromo: z.boolean().optional().default(false),
  isHouseSpecial: z.boolean().optional().default(false),

  // Promoción por tiempo: precio especial que solo aplica dentro de la ventana configurada
  // (hora del día / días de la semana / rango de fechas — todas las que estén cargadas deben
  // cumplirse a la vez). Solo tiene efecto en productos de precio simple.
  promoPriceEnabled: z.boolean().optional().default(false),
  promoPrice: z.coerce.number().nonnegative('El precio de promoción no puede ser negativo.').nullable().optional(),
  // "HH:mm" 24h, hora de Caracas.
  promoStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida, usa formato HH:mm.')
    .nullable()
    .optional(),
  promoEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida, usa formato HH:mm.')
    .nullable()
    .optional(),
  // 0=domingo..6=sábado. Vacío/ausente = todos los días.
  promoDaysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
  // "YYYY-MM-DD" — se guarda como medianoche UTC de esa fecha.
  promoStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),
  promoEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),

  priority: z.coerce.number().int().optional().default(0),
});

// En update todos los campos son opcionales.
export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
