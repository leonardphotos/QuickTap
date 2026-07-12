export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  baseCurrency: string;
  exchangeRate: string;
  whatsappPhone?: string | null;
}

export interface Category {
  id: string;
  name: string;
  priority: number;
  isActive?: boolean;
  _count?: { products: number };
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  price: string;
  photoUrl?: string | null;
  isAvailable: boolean;
  isStar: boolean;
  isPromo: boolean;
  isHouseSpecial: boolean;
  priority: number;
  category?: { id: string; name: string };
}

export interface PublicMenu {
  restaurant: Restaurant;
  highlights: {
    stars: Product[];
    promos: Product[];
    houseSpecials: Product[];
  };
  categories: { id: string; name: string; products: Product[] }[];
}

export interface TableItem {
  id: string;
  number: string;
  qrToken: string;
  isActive: boolean;
}

export type OrderStatus = 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED';
export type OrderChannel = 'DINE_IN' | 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';

export interface OrderItemView {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  modifiers: string[];
  note?: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: number;
  channel: OrderChannel;
  status: OrderStatus;
  totalUsd: string;
  totalBs: string;
  createdAt: string;
  table?: { number: string } | null;
  items: OrderItemView[];
}

export interface CartLine {
  product: Product;
  quantity: number;
  modifiers: string[];
  note?: string;
}
