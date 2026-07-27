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
});

export const createShopSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  total: z.coerce.number(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentMeta: z.object({ reference: z.string().optional(), hasProof: z.boolean().optional() }).nullable().optional(),
  creditTerms: z.enum(['FULL', 'INSTALLMENT']).nullable().optional(),
  amountPaidNow: z.coerce.number().nullable().optional(),
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
