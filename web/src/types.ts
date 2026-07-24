export type Currency = 'USD' | 'EUR';

export type UserRole = 'OWNER' | 'STAFF' | 'ADMIN' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'SCREEN' | 'COMANDA';

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
  primary?: string;
  buttonText?: string;
  accent?: string;
  text?: string;
  /** Color de arranque del degradado del banner (siempre se desvanece hacia blanco). */
  bannerColor?: string;
  /** Foto de portada del banner; si está presente, el degradado hacia blanco se aplica sobre la imagen. */
  coverImageUrl?: string;
  socialLinks?: RestaurantSocialLinks;
}

export type PaymentMethodKey = 'CASH' | 'CASH_USD' | 'MOBILE_PAYMENT' | 'ZELLE' | 'BINANCE' | 'PAYPAL' | 'TRANSFER' | 'CARD';

/** Datos propios de cada método de pago (los que apliquen); todos opcionales. */
export interface PaymentMethodFields {
  enabled?: boolean;
  banco?: string;
  telefono?: string;
  cedula?: string;
  titular?: string;
  correo?: string;
  id?: string;
  cuenta?: string;
  rif?: string;
}

export type PaymentMethodsConfig = Partial<Record<PaymentMethodKey, PaymentMethodFields>>;

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
  orderingEnabled: boolean;
  /** Según Ajustes → Horario. true si no hay horario configurado (siempre abierto). */
  isOpen?: boolean;
  closedReason?: string | null;
  requireOrderConfirmation: boolean;
  serviceChargeEnabled: boolean;
  ivaEnabled: boolean;
  rif?: string | null;
  paymentMethodsConfig?: PaymentMethodsConfig | null;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl?: string | null;
  deliveryOriginLat?: number | null;
  deliveryOriginLng?: number | null;
  /** Solo en el menú público: si el restaurante tiene al menos una mesa creada. */
  hasTables?: boolean;
}

export interface Category {
  id: string;
  name: string;
  priority: number;
  isActive?: boolean;
  _count?: { products: number };
}

/** Estación de cocina (ej: "Cocina Caliente", "Repostería", "Bar"). Máximo 10 por restaurante. */
export interface Kitchen {
  id: string;
  name: string;
  priority: number;
  _count?: { products: number };
}

/** Directorio de clientes: se crea/actualiza automáticamente al abrir una cuenta o hacer un pedido con teléfono. */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  idNumber?: string | null;
  address?: string | null;
}

/** Proveedor (módulo de Gastos). */
export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  taxId?: string | null;
}

export interface Modifier {
  id: string;
  name: string;
  priceBase: string;
  costBase?: string | null;
  discountBase?: string | null;
  isAvailable?: boolean;
  /** Tope de repetición de este modificador puntual (ej. "Ketchup máx. 2"), independiente del
   * límite de la categoría. null/undefined = sin tope propio. */
  maxQuantity?: number | null;
  /** Código interno opcional (back-office). Nunca viaja en el menú público. */
  sku?: string | null;
  priority?: number;
}

export interface ModifierCategory {
  id: string;
  name: string;
  isRequired: boolean;
  allowMultiple: boolean;
  /** Límite de selecciones totales cuando allowMultiple=true (permite repetir la misma opción,
   * ej. "Ketchup x4"). null/undefined = sin límite. Ya resuelto server-side (override del
   * producto si lo tiene, si no el de la categoría) — siempre es un único número final. */
  maxSelections?: number | null;
  /** Mínimo de selecciones totales cuando allowMultiple=true. null/undefined = usa el default
   * (1 si isRequired, 0 si no). */
  minSelections?: number | null;
  priority?: number;
  /** Cuántos productos tienen esta categoría asociada (solo en la biblioteca de Modificadores). */
  productCount?: number;
  modifiers: Modifier[];
}

export interface ProductVariant {
  id: string;
  name: string;
  priceBase: string;
  packagingFeeBase?: string | null;
  costBase?: string | null;
  discountBase?: string | null;
  isAvailable?: boolean;
  priority?: number;
}

export interface Product {
  id: string;
  categoryId: string;
  kitchenId?: string | null;
  name: string;
  description?: string | null;
  price: string;
  // Costo para el margen de utilidad: "RECIPE" (suma en vivo de la receta) o "MANUAL" (costBase).
  costSource: 'MANUAL' | 'RECIPE';
  costBase?: string | null;
  photoUrl?: string | null;
  /** Tiempo aproximado de preparación, en minutos. */
  prepTimeMinutes?: number | null;
  isAvailable: boolean;
  /** Código interno opcional (back-office). Nunca viaja en el menú público. */
  sku?: string | null;
  /** Control de stock simple por producto. null/false = sin control (siempre disponible). */
  stockControlEnabled?: boolean;
  stockQuantity?: number | null;
  /** Calculado en el backend: stockControlEnabled && stockQuantity<=0. Distinto de isAvailable (manual). */
  stockDepleted?: boolean;
  isStar: boolean;
  isPromo: boolean;
  isHouseSpecial: boolean;
  priority: number;
  category?: { id: string; name: string };
  // "SIMPLE" = precio único (el campo price); "VARIANTS" = el cliente elige entre `variants`.
  pricingMode?: 'SIMPLE' | 'VARIANTS';
  variants?: ProductVariant[];
  // Categorías de modificadores asociadas a este producto (con sus modificadores anidados).
  modifierCategories?: ModifierCategory[];
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
  assignedWaiterId?: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  canAccessInventory: boolean;
  createdAt: string;
}

export interface DeliveryCourier {
  id: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
}

export interface DeliveryCourierStats {
  courierId: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
  deliveries: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
}

export interface PaymentMethodStats {
  method: string;
  count: number;
  totalBase: string;
  totalBs: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  price: string;
  polygon: { lat: number; lng: number }[];
}

export interface SessionOrder {
  orderId: string;
  pedidoNumber: number;
  orderNumber: number;
  status: OrderStatus;
  createdAt: string;
  items: { name: string; variantName?: string | null; quantity: number; modifiers: string[]; note?: string | null }[];
}

export interface TableSession {
  id: string;
  customerName: string;
  customerIdNumber: string;
  openedAt: string;
  pinRequired: boolean;
  /** Nombre de la cuenta cuando la mesa tiene varias abiertas a la vez (ej. "Cuenta 2"). Null = sin nombre propio. */
  label: string | null;
  /** Suma de todos los pedidos de esta cuenta. */
  totalBase: string;
  orders: SessionOrder[];
}

export type ServiceRequestType = 'WAITER_CALL' | 'BILL_REQUEST';

export interface FloorPlanTable {
  id: string;
  number: string;
  /** Una mesa puede tener varias cuentas abiertas a la vez (independientes entre sí). Vacío = mesa libre. */
  sessions: TableSession[];
  serviceRequest: ServiceRequestType | null;
  /** Tiene una reserva confirmada para hoy y no está ocupada ahora mismo. */
  reserved: boolean;
}

export interface FloorPlan {
  zones: { id: string; name: string; tables: FloorPlanTable[] }[];
  unzoned: FloorPlanTable[];
}

export interface PublicTableSessionStatus {
  isOpen: boolean;
  customerName: string | null;
  /** Ya decidió si proteger la mesa con clave o dejarla abierta. */
  pinDecided: boolean;
  /** La cuenta está protegida: hace falta la clave para pedir de nuevo. */
  pinRequired: boolean;
  /** La mesa tiene varias cuentas abiertas a la vez: el autopedido público queda bloqueado. */
  multipleAccounts: boolean;
}

export type OrderStatus = 'NEEDS_CONFIRMATION' | 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED';
export type OrderChannel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
export type PaymentMethod = PaymentMethodKey;

export interface OrderItemView {
  id: string;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  modifiers: { name: string; priceBase: string; quantity: number }[];
  note?: string | null;
  /** Cocina asignada al producto al momento del pedido (snapshot). null = sin asignar. */
  kitchenName?: string | null;
  /** Cuándo esa estación marcó su parte lista. null = todavía pendiente. */
  kitchenReadyAt?: string | null;
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

export interface SelectedModifier {
  modifierId: string;
  name: string;
  priceBase: string;
  /** Cuántas veces se eligió esta misma opción (ej. "Ketchup x4"). Default 1. */
  quantity: number;
}

export interface CartLine {
  product: Product;
  quantity: number;
  // Si el producto usa "Precio por variantes", cuál eligió el cliente.
  variantId?: string;
  variantName?: string;
  selectedModifiers: SelectedModifier[];
  note?: string;
}
