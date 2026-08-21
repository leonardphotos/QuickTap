import { api } from '@/api/client';
import type { ShopVariant } from '@/data/shopRubros';
import type { NewProductInput, PaymentMeta, CreditTerms } from './shopSession';

/** Forma cruda que devuelve el backend — shop.service.ts (src/modules/shop/) es la contraparte. */

export interface RawShopVariant {
  description?: string | null;
  id: string;
  v1: string;
  v2: string;
  stock: number;
  soldByWeight: boolean;
}

export interface RawShopProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  sku: string;
  location: string;
  price: number;
  cost: number;
  minStock: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  promoPrice: number | null;
  expiryDate: string | null;
  photoUrl: string | null;
  /** Aparece en el catálogo público de la tienda virtual (ver ShopProduct.isPublished). */
  isPublished: boolean;
  pricingMode: string;
  rollWidths: number[] | null;
  rollLengthM: number | null;
  saleUnit?: string | null;
  isEvent?: boolean | null;
  eventDate?: string | null;
  eventSeats?: number | null;
  variants: RawShopVariant[];
}

export interface RawShopSaleItem {
  productId: string | null;
  v1: string;
  v2: string;
  name: string;
  category: string | null;
  qty: number;
  price: number;
  cost: number;
  soldByWeight: boolean;
  detail: string | null;
  stockQty: number | null;
  staffUserId: string | null;
  commissionPercent: number | null;
  commissionBase: number | null;
}

/** Una línea de la receta de insumos de un servicio (ver ShopServiceSupply en el backend). */
export interface RawShopServiceSupply {
  id: string;
  serviceProductId: string;
  supplyProductId: string;
  supplyV1: string;
  supplyV2: string;
  quantity: number;
}

export interface RawShopSale {
  id: string;
  total: number;
  time: string;
  customerName: string | null;
  customerPhone: string | null;
  returned: boolean;
  paymentMethod: string | null;
  paymentMeta: PaymentMeta | null;
  creditTerms: CreditTerms | null;
  amountPaidNow: number | null;
  soldByUserId: string | null;
  soldByUserName: string | null;
  items: RawShopSaleItem[];
}

export interface RawShopPurchase {
  id: string;
  supplier: string;
  productId: string | null;
  productName: string;
  v1: string;
  v2: string;
  qty: number;
  cost: number;
  time: string;
}

export interface RawShopAdjustment {
  id: string;
  productId: string | null;
  productName: string;
  v1: string;
  v2: string;
  before: number;
  after: number;
  diff: number;
  reason: string;
  time: string;
}

export interface RawShopTill {
  id: string;
  openedAt: string;
  closedAt: string | null;
  opening: number;
  salesCount: number | null;
  totalSales: number | null;
  expected: number | null;
  counted: number | null;
  diff: number | null;
}

export interface ShopState {
  products: RawShopProduct[];
  sales: RawShopSale[];
  purchases: RawShopPurchase[];
  adjustments: RawShopAdjustment[];
  categories: string[];
  subcategories: Record<string, string[]>;
  till: RawShopTill | null;
  closedTills: RawShopTill[];
  serviceSupplies: RawShopServiceSupply[];
}

export const shopApi = {
  async getState(): Promise<ShopState> {
    const { data } = await api.get('/shop/state');
    return data.data;
  },

  async createProduct(input: NewProductInput): Promise<RawShopProduct> {
    const { data } = await api.post('/shop/products', input);
    return data.data;
  },

  async updateProduct(id: string, input: NewProductInput): Promise<RawShopProduct> {
    const { data } = await api.patch(`/shop/products/${id}`, input);
    return data.data;
  },

  /** Publica/quita varios productos del catálogo público de la tienda virtual. */
  async setProductsPublished(productIds: string[], isPublished: boolean): Promise<void> {
    await api.patch('/shop/products/published', { productIds, isPublished });
  },

  async deleteProduct(id: string): Promise<void> {
    await api.delete(`/shop/products/${id}`);
  },

  async setServiceSupplies(
    serviceProductId: string,
    supplies: { supplyProductId: string; supplyV1: string; supplyV2: string; quantity: number }[],
  ): Promise<RawShopServiceSupply[]> {
    const { data } = await api.put(`/shop/products/${serviceProductId}/supplies`, { supplies });
    return data.data;
  },

  async recordSale(payload: {
    items: {
      productId?: string;
      v1: string;
      v2: string;
      name: string;
      category: string | null;
      qty: number;
      price: number;
      cost: number;
      soldByWeight?: boolean;
      detail?: string;
      stockQty?: number;
      staffUserId?: string | null;
    }[];
    total: number;
    customerName: string | null;
    customerPhone: string | null;
    paymentMethod: string | null;
    paymentMeta: PaymentMeta | null;
    creditTerms: CreditTerms | null;
    amountPaidNow: number | null;
    /** A cuál cuenta bancaria entró el cobro, cuando el método tiene varias. */
    bankAccountId?: string | null;
    /** Promoción del CRM aplicada: el backend valida el código y registra el canje. */
    promoCode?: string | null;
    promoDiscountBase?: number | null;
  }): Promise<RawShopSale> {
    const { data } = await api.post('/shop/sales', payload);
    return data.data;
  },

  async returnSale(id: string): Promise<void> {
    await api.post(`/shop/sales/${id}/return`);
  },

  async recordPurchase(payload: { supplier: string; productId: string; v1: string; v2: string; qty: number; cost: number }): Promise<void> {
    await api.post('/shop/purchases', payload);
  },

  async recordAdjustment(payload: { productId: string; v1: string; v2: string; counted: number; reason: string }): Promise<void> {
    await api.post('/shop/adjustments', payload);
  },

  async openTill(opening: number): Promise<void> {
    await api.post('/shop/till/open', { opening });
  },

  async closeTill(counted: number): Promise<void> {
    await api.post('/shop/till/close', { counted });
  },

  async addCategory(name: string): Promise<void> {
    await api.post('/shop/categories', { name });
  },

  async addSubcategory(category: string, name: string): Promise<void> {
    await api.post(`/shop/categories/${encodeURIComponent(category)}/subcategories`, { name });
  },
};

export function toShopVariant(v: RawShopVariant): ShopVariant {
  return { v1: v.v1, v2: v.v2, stock: v.stock, soldByWeight: v.soldByWeight, description: v.description ?? undefined };
}

export function toShopProduct(p: RawShopProduct) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    brand: p.brand,
    sku: p.sku,
    location: p.location,
    price: p.price,
    cost: p.cost,
    minStock: p.minStock,
    variants: p.variants.map(toShopVariant),
    wholesalePrice: p.wholesalePrice ?? undefined,
    wholesaleMinQty: p.wholesaleMinQty ?? undefined,
    promoPrice: p.promoPrice ?? undefined,
    expiryDate: p.expiryDate ?? undefined,
    photoUrl: p.photoUrl ?? undefined,
    isPublished: p.isPublished ?? false,
    pricingMode: (p.pricingMode === 'AREA_ROLL' || p.pricingMode === 'SERVICE' ? p.pricingMode : 'UNIT') as
      | 'UNIT'
      | 'AREA_ROLL'
      | 'SERVICE',
    rollWidths: p.rollWidths ?? undefined,
    rollLengthM: p.rollLengthM ?? undefined,
    // Unidad de venta y datos de evento: este mapeo copia campo por campo, así que todo lo que
    // no se liste acá se pierde en el camino aunque el backend lo devuelva.
    saleUnit: (p.saleUnit === 'KG' || p.saleUnit === 'MT' ? p.saleUnit : 'UND') as 'UND' | 'KG' | 'MT',
    isEvent: p.isEvent ?? false,
    eventDate: p.eventDate ?? undefined,
    eventSeats: p.eventSeats ?? undefined,
  };
}
