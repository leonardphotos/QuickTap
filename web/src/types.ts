export type Currency = 'USD' | 'EUR';

export type UserRole = 'OWNER' | 'STAFF' | 'ADMIN' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'SCREEN';

export interface ExchangeRateInfo {
  rateBs: string;
  fetchedAt: string;
}

/** Enlaces a redes sociales del restaurante, mostrados en el banner del menú público. */
export interface RestaurantSocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  x?: string;
}

/** Colores personalizados del menú público. Todas las claves son opcionales. */
export interface RestaurantTheme {
  background?: string;
  primary?: string;
  buttonText?: string;
  accent?: string;
  text?: string;
  bannerColor?: string;
  socialLinks?: RestaurantSocialLinks;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  baseCurrency: Currency;
  currencySymbol: string;
  /** Tasa BCV vigente para baseCurrency. Null si aún no se ha logrado obtener ninguna. */
  exchangeRate: ExchangeRateInfo | null;
  whatsappPhone?: string | null;
  theme?: RestaurantTheme | null;
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

export interface Zone {
  id: string;
  name: string;
  priority: number;
  isActive?: boolean;
  _count?: { tables: number };
}

export interface TableItem {
  id: string;
  number: string;
  qrToken: string;
  isActive: boolean;
  zoneId?: string | null;
  zone?: { id: string; name: string } | null;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface SessionOrder {
  orderId: string;
  pedidoNumber: number;
  orderNumber: number;
  status: OrderStatus;
  createdAt: string;
  items: { name: string; quantity: number; modifiers: string[]; note?: string | null }[];
}

export interface TableSession {
  id: string;
  customerName: string;
  customerIdNumber: string;
  openedAt: string;
  orders: SessionOrder[];
}

export type ServiceRequestType = 'WAITER_CALL' | 'BILL_REQUEST';

export interface FloorPlanTable {
  id: string;
  number: string;
  session: TableSession | null;
  serviceRequest: ServiceRequestType | null;
}

export interface FloorPlan {
  zones: { id: string; name: string; tables: FloorPlanTable[] }[];
  unzoned: FloorPlanTable[];
}

export interface PublicTableSessionStatus {
  isOpen: boolean;
  customerName: string | null;
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
  currency: Currency;
  totalBase: string;
  totalBs: string;
  createdAt: string;
  customerName?: string | null;
  table?: { number: string } | null;
  items: OrderItemView[];
}

export interface CartLine {
  product: Product;
  quantity: number;
  modifiers: string[];
  note?: string;
}
