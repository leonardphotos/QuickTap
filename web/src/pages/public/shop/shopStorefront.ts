/**
 * Tipos y carrito de la tienda virtual del Local Comercial (catálogo público).
 *
 * Deliberadamente más simple que el del menú de restaurantes: acá no hay modificadores ni
 * pedidos en mesa, solo producto + variante + cantidad. Lo que sí comparte es que el precio
 * mostrado es de referencia — el que vale es el que recalcula el servidor al hacer el pedido.
 */

export interface StorefrontVariant {
  id: string;
  v1: string;
  v2: string;
  soldByWeight: boolean;
  available: boolean;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string | null;
  /** Recinto/lugar del evento en el rubro Tickera (campo "Ubicación" del inventario). */
  location: string | null;
  photoUrl: string | null;
  price: number;
  /** Precio tachado cuando hay precio promocional vigente. */
  originalPrice: number | null;
  isService: boolean;
  variants: StorefrontVariant[];
  available: boolean;
  /** Entrada a un evento: lleva fecha, hora y cupo restante. */
  isEvent?: boolean;
  eventDate?: string | null;
  eventTime?: string | null;
  seatsLeft?: number | null;
}

export interface StorefrontShop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  baseCurrency: string;
  currencySymbol: string;
  exchangeRate: { rateBs: string; fetchedAt: string } | null;
  whatsappPhone: string | null;
  whatsappBotConnected: boolean;
  theme: { text?: string; primary?: string; accent?: string; buttonText?: string; coverImageUrl?: string; bannerColor?: string; bannerStyle?: string; bioColor?: string } | null;
  orderingEnabled: boolean;
  isOpen: boolean;
  closedReason: string | null;
  paymentMethodsConfig: Record<string, Record<string, string | boolean | undefined>> | null;
  shopRubro: string | null;
  /** Tarifa plana de envío del local, en su moneda base. 0 = sin cargo. */
  deliveryFee: number;
}

export interface Storefront {
  shop: StorefrontShop;
  categories: { name: string; products: StorefrontProduct[] }[];
}

export interface CartLine {
  product: StorefrontProduct;
  variant: StorefrontVariant;
  qty: number;
}

/** Una línea es la misma solo si coinciden producto Y variante: dos tallas del mismo modelo
 * son renglones distintos del carrito, no uno con cantidad 2. */
export function sameLine(a: CartLine, b: { productId: string; v1: string; v2: string }): boolean {
  return a.product.id === b.productId && a.variant.v1 === b.v1 && a.variant.v2 === b.v2;
}

export function cartSubtotal(cart: CartLine[]): number {
  return cart.reduce((acc, l) => acc + l.product.price * l.qty, 0);
}

/** Los productos que se venden por peso admiten decimales (0,250 kg); el resto, unidades. */
export function stepFor(variant: StorefrontVariant): number {
  return variant.soldByWeight ? 0.25 : 1;
}

export function formatQty(qty: number, variant: StorefrontVariant): string {
  return variant.soldByWeight ? `${qty.toLocaleString('es-VE', { maximumFractionDigits: 3 })} kg` : String(qty);
}
