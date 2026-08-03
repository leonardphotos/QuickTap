import { z } from 'zod';

const variantSchema = z.object({
  v1: z.string().min(1).max(60),
  v2: z.string().max(60).optional().default(''),
  stock: z.coerce.number().min(0),
  soldByWeight: z.boolean().optional().default(false),
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
  // a ser por m²), 'UNIT' es la venta por unidad de siempre. Ver printPricing.ts en el frontend.
  pricingMode: z.enum(['UNIT', 'AREA_ROLL']).optional(),
  // Anchos de rollo en metros. Se acota a 6 m para atajar un tipeo (ej. "137" en vez de "1,37"),
  // que dispararía el precio por las nubes sin que nadie lo note.
  rollWidths: z.array(z.coerce.number().gt(0).max(6)).max(12).optional(),
  rollLengthM: z.coerce.number().gt(0).max(1000).optional(),
});

export const updateShopProductSchema = createShopProductSchema.partial();

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
});

export const createShopSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  total: z.coerce.number(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentMeta: z
    .object({ reference: z.string().optional(), hasProof: z.boolean().optional(), proofImageUrl: z.string().optional() })
    .nullable()
    .optional(),
  creditTerms: z.enum(['FULL', 'INSTALLMENT']).nullable().optional(),
  amountPaidNow: z.coerce.number().nullable().optional(),
  // Fecha en que el cliente se compromete a pagar el saldo — solo tiene sentido si creditTerms
  // no es null. Texto libre ISO yyyy-mm-dd, igual que ShopProduct.expiryDate.
  dueDate: z.string().max(10).nullable().optional(),
});

// Cuentas por Cobrar: abono posterior contra una venta fiada.
export const createShopSalePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().max(60).optional(),
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
export type OpenShopTillInput = z.infer<typeof openShopTillSchema>;
export type CloseShopTillInput = z.infer<typeof closeShopTillSchema>;
