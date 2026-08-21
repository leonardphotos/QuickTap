import { z } from 'zod';

/** Filtro de período para Panel administrativo → Punto de equilibrio. */
export const breakEvenQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).optional().default('month'),
  // Fecha exacta ("YYYY-MM-DD"): si viene, ignora `range` y filtra ese día completo.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const variantSchema = z.object({
  v1: z.string().min(1).max(60),
  v2: z.string().max(60).optional().default(''),
  stock: z.coerce.number().min(0),
  soldByWeight: z.boolean().optional().default(false),
  // Descripción propia de la variante. Vacío = se usa la del producto.
  description: z.string().max(500).optional(),
});

export const createShopProductSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  subcategory: z.string().max(60).optional().default(''),
  // Marca del producto (ej. "Coca-Cola") — separada de la categoría para poder agrupar/filtrar
  // el inventario por marca sin mezclarla con la clasificación por tipo de producto.
  brand: z.string().max(60).optional().default(''),
  sku: z.string().max(60).optional().default(''),
  location: z.string().max(60).optional().default(''),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0),
  minStock: z.coerce.number().min(0),
  variants: z.array(variantSchema).min(1),
  wholesalePrice: z.coerce.number().min(0).optional(),
  wholesaleMinQty: z.coerce.number().min(0).optional(),
  promoPrice: z.coerce.number().min(0).optional(),
  expiryDate: z.string().max(10).optional(),
  photoUrl: z.string().min(1).optional(),
  // Impresión de gran formato: 'AREA_ROLL' cobra por m² saliendo de un rollo (price/cost pasan
  // a ser por m²). 'SERVICE' es un rubro de servicios (estética/barbería): no lleva stock.
  // 'UNIT' es la venta por unidad de siempre. Ver printPricing.ts en el frontend.
  pricingMode: z.enum(['UNIT', 'AREA_ROLL', 'SERVICE']).optional(),
  // Anchos de rollo en metros. Se acota a 6 m para atajar un tipeo (ej. "137" en vez de "1,37"),
  // que dispararía el precio por las nubes sin que nadie lo note.
  rollWidths: z.array(z.coerce.number().gt(0).max(6)).max(12).optional(),
  rollLengthM: z.coerce.number().gt(0).max(1000).optional(),
  // Aparece en el catálogo público de la tienda virtual. Apagado por defecto: el inventario
  // también guarda insumos internos que no se le venden a nadie (ver ShopProduct.isPublished).
  isPublished: z.boolean().optional(),
  // --- Eventos ---
  // Un evento se vende y se cobra como cualquier producto, pero además tiene día y cupo. Se
  // marca con esta bandera y no por el nombre de la categoría, para que el local pueda
  // renombrar "Eventos" sin que el comportamiento cambie.
  // Unidad de venta: por unidad, por kilo o por metro (ferreterías y cualquier granel).
  saleUnit: z.enum(['UND', 'KG', 'MT']).optional(),
  isEvent: z.boolean().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha del evento debe ser yyyy-mm-dd.').optional(),
  eventSeats: z.coerce.number().int().min(1).max(100000).optional(),
})
  .refine((v) => !v.isEvent || (v.eventDate && v.eventSeats), {
    message: 'Un evento necesita fecha y cantidad de puestos.',
    path: ['eventDate'],
  });

// El schema base sin el refine, porque .partial() no existe sobre un schema con refine.
export const updateShopProductSchema = createShopProductSchema.innerType().partial();

/** Publicar/despublicar varios productos de una — el dueño de una tienda con cientos de
 * artículos no va a entrar uno por uno para encender su vitrina. */
export const setShopProductsPublishedSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(1000),
  isPublished: z.boolean(),
});

export type SetShopProductsPublishedInput = z.infer<typeof setShopProductsPublishedSchema>;

const saleItemSchema = z.object({
  productId: z.string().optional(),
  v1: z.string().default(''),
  v2: z.string().default(''),
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  qty: z.coerce.number(),
  price: z.coerce.number(),
  cost: z.coerce.number().default(0),
  soldByWeight: z.boolean().optional().default(false),
  // "1,20 × 0,80 m · rollo 1,37" — de dónde salió la cantidad de esta línea (ver ShopSaleItem).
  detail: z.string().max(200).nullable().optional(),
  // Metros lineales a descontar del rollo, cuando difiere de `qty` (que son los m² cobrados).
  stockQty: z.coerce.number().min(0).nullable().optional(),
  // Profesional que prestó este servicio (barbero/estilista) — alimenta el reporte por barbero.
  staffUserId: z.string().nullable().optional(),
});

export const createShopSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  total: z.coerce.number(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  // Obligatorio: toda venta dice con qué se cobró (etiqueta del método configurado en el
  // local). Las ventas fiadas también lo llevan — es el método con el que se abonó/abonará.
  paymentMethod: z.string().min(1, 'Escoge un método de pago.'),
  paymentMeta: z
    .object({ reference: z.string().optional(), hasProof: z.boolean().optional(), proofImageUrl: z.string().optional() })
    .nullable()
    .optional(),
  creditTerms: z.enum(['FULL', 'INSTALLMENT']).nullable().optional(),
  amountPaidNow: z.coerce.number().nullable().optional(),
  // Fecha en que el cliente se compromete a pagar el saldo — solo tiene sentido si creditTerms
  // no es null. Texto libre ISO yyyy-mm-dd, igual que ShopProduct.expiryDate.
  dueDate: z.string().max(10).nullable().optional(),
  // A cuál cuenta bancaria entró el dinero, cuando el método tiene varias (varios Zelle…).
  bankAccountId: z.string().max(60).nullish(),
  // Código de promoción del CRM aplicado a esta venta. `total` ya viene con el
  // descuento restado (el POS calcula el total); el servidor valida el código,
  // recalcula el descuento sobre el total original y registra el canje.
  promoCode: z.string().max(40).nullish(),
  promoDiscountBase: z.coerce.number().nonnegative().max(1000000).nullish(),
});

// Cuentas por Cobrar: abono posterior contra una venta fiada.
export const createShopSalePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().max(60).optional(),
  bankAccountId: z.string().max(60).nullish(),
});

export const setShopSaleDueDateSchema = z.object({
  dueDate: z.string().max(10).nullable(),
});

// v1/v2 (no un índice numérico) identifican la variante: el orden en que Postgres devuelve las
// variantes no está garantizado igual al del array local del frontend, así que resolvemos por
// contenido en vez de por posición — ver shopSession.ts, que traduce variantIndex -> v1/v2 antes
// de llamar a la API.
export const createShopPurchaseSchema = z.object({
  supplier: z.string().min(1).max(120),
  productId: z.string().min(1),
  v1: z.string(),
  v2: z.string(),
  qty: z.coerce.number().gt(0),
  cost: z.coerce.number().min(0),
});

export const createShopAdjustmentSchema = z.object({
  productId: z.string().min(1),
  v1: z.string(),
  v2: z.string(),
  counted: z.coerce.number().min(0),
  reason: z.string().max(200).optional().default(''),
});

// Receta de insumos de un servicio: se reemplaza completa (igual que las variantes de un
// producto), en vez de ir agregando/quitando línea por línea.
export const setShopServiceSuppliesSchema = z.object({
  supplies: z
    .array(
      z.object({
        supplyProductId: z.string().min(1),
        supplyV1: z.string().default(''),
        supplyV2: z.string().default(''),
        quantity: z.coerce.number().gt(0),
      }),
    )
    .max(30),
});

export const openShopTillSchema = z.object({
  opening: z.coerce.number().min(0),
});

export const closeShopTillSchema = z.object({
  counted: z.coerce.number().min(0),
});

export const addShopCategorySchema = z.object({
  name: z.string().min(1).max(60),
});

export const addShopSubcategorySchema = z.object({
  name: z.string().min(1).max(60),
});

export type CreateShopProductInput = z.infer<typeof createShopProductSchema>;
export type UpdateShopProductInput = z.infer<typeof updateShopProductSchema>;
export type CreateShopSaleInput = z.infer<typeof createShopSaleSchema>;
export type CreateShopPurchaseInput = z.infer<typeof createShopPurchaseSchema>;
export type CreateShopAdjustmentInput = z.infer<typeof createShopAdjustmentSchema>;
export type SetShopServiceSuppliesInput = z.infer<typeof setShopServiceSuppliesSchema>;
export type OpenShopTillInput = z.infer<typeof openShopTillSchema>;
export type CloseShopTillInput = z.infer<typeof closeShopTillSchema>;
