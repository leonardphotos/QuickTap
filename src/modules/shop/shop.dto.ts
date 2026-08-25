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
  // Precio y costo propios de la variante (null/ausente = usa los del producto). Ver
  // ShopProductVariant: las variantes de presión de una manguera se venden y se compran a
  // precios distintos entre sí.
  price: z.coerce.number().min(0).nullable().optional(),
  cost: z.coerce.number().min(0).nullable().optional(),
});

const shopProductFields = z.object({
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
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora del evento debe ser HH:mm.').optional(),
  eventSeats: z.coerce.number().int().min(1).max(100000).optional(),
  eventDescription: z.string().max(4000).optional(),
  // Tope de 5: es lo que muestra el carrusel de la taquilla.
  eventImages: z.array(z.string().max(300)).max(5).optional(),
  eventTerms: z.string().max(6000).optional(),
  eventFinancingEnabled: z.boolean().optional(),
  // Inicial en % del precio. Se admite 0 (financiar todo) pero no 100 — eso es pago completo.
  eventDownPercent: z.coerce.number().min(0).max(99).optional(),
  eventInstallments: z.coerce.number().int().min(2).max(60).optional(),
  eventFrequency: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL']).optional(),
  // --- Plan de consumo ---
  consumptionPlanEnabled: z.boolean().optional(),
  consumptionPlanRate: z.coerce.number().gt(0).optional(),
  consumptionPlanSizes: z.array(z.coerce.number().gt(0).max(100000)).max(10).optional(),
});

export const createShopProductSchema = shopProductFields
  .refine((v) => !v.isEvent || (v.eventDate && v.eventTime && v.eventSeats), {
    message: 'Un evento necesita fecha, hora y cantidad de puestos.',
    path: ['eventDate'],
  })
  .refine((v) => !v.eventFinancingEnabled || (v.eventInstallments != null && v.eventDownPercent != null), {
    message: 'Un evento financiado necesita inicial y cantidad de cuotas.',
    path: ['eventInstallments'],
  });

// Se parte del OBJETO base y no de createShopProductSchema: .partial() no existe sobre un
// schema con refine, y con dos encima .innerType() ya no alcanza para desenvolverlo.
export const updateShopProductSchema = shopProductFields.partial();

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
  // Pedido de la tienda que originó esta venta, cuando viene de confirmar uno. Lo pone el
  // servidor (shop-orders.service.confirm), nunca el POS.
  shopOrderId: z.string().max(40).nullish(),
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
  // Peso de esta carga en Kg. Aparte de qty: un rollo de manguera entra como 1 rollo pero pesa
  // 43 Kg, y cada rollo del mismo tipo pesa distinto. Ver ShopPurchase.weightKg.
  weightKg: z.coerce.number().min(0).nullable().optional(),
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

/**
 * Pedido abierto. Las líneas se aceptan como JSON libre a propósito: es el carrito del POS y su
 * forma la manda esa pantalla — validarla campo por campo acá obligaría a tocar dos archivos
 * cada vez que el carrito gana una variante o un descuento nuevo. Solo se acota el tamaño, para
 * que nadie use la tabla de depósito.
 */
export const openOrderSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1, 'Ponle un nombre al pedido.').max(80),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(40).optional(),
  items: z.array(z.record(z.string(), z.unknown())).min(1, 'El pedido no tiene productos.').max(300),
});
export type OpenOrderInput = z.infer<typeof openOrderSchema>;
export type CreateConsumptionPlanInput = z.infer<typeof createConsumptionPlanSchema>;
export type ConsumePlanInput = z.infer<typeof consumePlanSchema>;

// --- Plan de consumo ---

/** Activa un plan: cobra el paquete completo por adelantado (ver ShopConsumptionPlan). */
export const createConsumptionPlanSchema = z.object({
  productId: z.string().min(1),
  customerName: z.string().min(1, 'Escribe el nombre del cliente.').max(120),
  customerPhone: z.string().min(7, 'Escribe el teléfono del cliente.').max(40),
  totalUnits: z.coerce.number().gt(0),
  // El monto ya cobrado (paquete × tarifa del plan). Se recibe del cliente y no se recalcula acá
  // porque la venta que lo cobró ya pasó por recordSale con sus propios redondeos; este número
  // tiene que coincidir con lo que el cliente efectivamente pagó, no con una nueva cuenta.
  totalPaid: z.coerce.number().gt(0),
  activatedSaleId: z.string().min(1).optional(),
});

/** Descuenta unidades de un plan activo — el consumo en sí no cobra nada, ya se pagó al activar. */
export const consumePlanSchema = z.object({
  units: z.coerce.number().gt(0),
  saleId: z.string().min(1).optional(),
});
