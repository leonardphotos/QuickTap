import { api } from '@/api/client';

/**
 * La tienda del club corre sobre el MISMO backend que Locales (/shop/*): esos
 * endpoints solo piden tenantGuard, no están atados a businessType. Por eso acá
 * no hay lógica de negocio nueva, solo el cliente tipado con lo que el club usa
 * (productos con stock y venta rápida) — sin variantes de talla/color ni rollos,
 * que son de retail.
 */

export interface StoreVariant {
  id: string;
  v1: string;
  v2: string;
  stock: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  minStock: number;
  photoUrl: string | null;
  variants: StoreVariant[];
}

export interface StoreSale {
  id: string;
  total: number;
  time: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  creditTerms: string | null;
  settledAt: string | null;
  returned: boolean;
  items: { name: string; qty: number; price: number }[];
}

/** Stock total de un producto: el club vende unidades sueltas, sin variantes reales. */
export function stockOf(p: StoreProduct): number {
  return p.variants.reduce((acc, v) => acc + v.stock, 0);
}

export function isLow(p: StoreProduct): boolean {
  return stockOf(p) <= p.minStock;
}

export const clubStoreApi = {
  state: () =>
    api.get('/shop/state').then((r) => ({
      products: (r.data.data.products ?? []) as StoreProduct[],
      sales: (r.data.data.sales ?? []) as StoreSale[],
      categories: (r.data.data.categories ?? []) as string[],
    })),

  createProduct: (body: {
    name: string;
    category: string;
    price: number;
    cost: number;
    minStock: number;
    stock: number;
  }) =>
    api.post('/shop/products', {
      name: body.name,
      category: body.category,
      price: body.price,
      cost: body.cost,
      minStock: body.minStock,
      // El club no maneja tallas ni colores: una sola variante "Unidad".
      variants: [{ v1: 'Unidad', v2: '', stock: body.stock }],
    }),

  /** Recuento/reposición: fija el stock al valor contado. */
  adjustStock: (product: StoreProduct, after: number, reason: string) =>
    api.post('/shop/adjustments', {
      productId: product.id,
      productName: product.name,
      v1: product.variants[0]?.v1 ?? 'Unidad',
      v2: product.variants[0]?.v2 ?? '',
      before: stockOf(product),
      after,
      diff: after - stockOf(product),
      reason,
    }),

  sell: (body: {
    items: { productId: string; name: string; category: string; qty: number; price: number; cost: number; v1: string; v2: string }[];
    total: number;
    paymentMethod: string;
    customerName?: string;
    customerPhone?: string;
    creditTerms?: 'FULL' | null;
  }) =>
    api.post('/shop/sales', {
      items: body.items,
      total: body.total,
      paymentMethod: body.paymentMethod,
      customerName: body.customerName ?? null,
      customerPhone: body.customerPhone ?? null,
      creditTerms: body.creditTerms ?? null,
    }),
};

/** Métodos de cobro del mostrador del club. "Cuenta abierta" es la venta fiada. */
export const STORE_PAYMENT_METHODS = ['Efectivo Bs', 'Efectivo $', 'Pago Móvil', 'Punto de venta', 'Zelle'];
