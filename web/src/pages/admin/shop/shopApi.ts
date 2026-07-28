import { api } from '@/api/client';
import type { ShopVariant } from '@/data/shopRubros';
import type { NewProductInput, PaymentMeta, CreditTerms } from './shopSession';

/** Forma cruda que devuelve el backend — shop.service.ts (src/modules/shop/) es la contraparte. */

export interface RawShopVariant {
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

  async recordSale(payload: {
    items: { productId?: string; v1: string; v2: string; name: string; category: string | null; qty: number; price: number; cost: number; soldByWeight?: boolean }[];
    total: number;
    customerName: string | null;
    customerPhone: string | null;
    paymentMethod: string | null;
    paymentMeta: PaymentMeta | null;
    creditTerms: CreditTerms | null;
    amountPaidNow: number | null;
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
  return { v1: v.v1, v2: v.v2, stock: v.stock, soldByWeight: v.soldByWeight };
}

export function toShopProduct(p: RawShopProduct) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
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
  };
}
