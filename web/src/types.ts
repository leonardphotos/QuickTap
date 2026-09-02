export type Currency = 'USD' | 'EUR';

export type UserRole =
  | 'OWNER'
  | 'STAFF'
  | 'ADMIN'
  | 'CASHIER'
  | 'WAITER'
  | 'WAITER_TABLET'
  | 'KITCHEN'
  | 'SCREEN'
  | 'COMANDA'
  | 'NUMERO'
  | 'CANCHA'
  | 'COACH'
  | 'VERIFICADOR';

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
  /** Color del texto de la biografía (descripción) en el banner. Sin definir = blanco semitransparente. */
  bioColor?: string;
  /** Difumina la foto de portada del banner (no aplica si no hay foto). Default: apagado. */
  bannerBlurEnabled?: boolean;
  /** "gradient" (de siempre) o "solid" (color/foto sin desvanecer hacia blanco). Default: "gradient". */
  bannerStyle?: 'gradient' | 'solid';
  socialLinks?: RestaurantSocialLinks;
}

export type PaymentMethodKey = 'CASH' | 'CASH_USD' | 'MOBILE_PAYMENT' | 'ZELLE' | 'BINANCE' | 'PAYPAL' | 'TRANSFER' | 'CARD';

/** Una cuenta receptora ADICIONAL de un método (el segundo Zelle, el segundo Pago Móvil…).
 *  `key` es su id estable en la UI; `label` la distingue al elegir en caja ("Zelle Chase"). */
export interface PaymentMethodExtraAccount {
  key: string;
  label?: string;
  banco?: string;
  telefono?: string;
  cedula?: string;
  titular?: string;
  correo?: string;
  id?: string;
  cuenta?: string;
  rif?: string;
  qrImageUrl?: string;
  /** Cuenta bancaria registrada a la que suma el cobro que entre por acá. */
  bankAccountId?: string | null;
}

/** Datos propios de cada método de pago (los que apliquen); todos opcionales. */
export interface PaymentMethodFields {
  enabled?: boolean;
  label?: string;
  banco?: string;
  telefono?: string;
  cedula?: string;
  titular?: string;
  correo?: string;
  id?: string;
  cuenta?: string;
  rif?: string;
  /** QR que el cliente escanea al cobrar: Pago Móvil (banco/Suiche 7B), Zelle y Binance. */
  qrImageUrl?: string;
  /** Cuenta bancaria registrada vinculada a la cuenta principal del método. */
  bankAccountId?: string | null;
  /** Cuentas adicionales del mismo método: varios Zelle, varios Pago Móvil… */
  extraAccounts?: PaymentMethodExtraAccount[];
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
  /** Chatbot de WhatsApp vinculado y activo — cambia el checkout de delivery/pickup a "Ordenar"
   * directo (sin abrir wa.me), porque el bot ya le manda los datos de pago al cliente solo. */
  whatsappBotConnected?: boolean;
  theme?: RestaurantTheme | null;
  orderingEnabled: boolean;
  /** Tienda virtual del Local Comercial: tarifa plana de envío en la moneda base. */
  shopDeliveryFee?: number | string | null;
  /** Según Ajustes → Horario. true si no hay horario configurado (siempre abierto). */
  isOpen?: boolean;
  closedReason?: string | null;
  requireOrderConfirmation: boolean;
  /** CRM: el checkout de delivery exige nombre y teléfono (ya son obligatorios igual). */
  requireCustomerData?: boolean;
  /** Si es false, la tablet de la cancha deja de ofrecer "Pagar" (solo detalle de cuenta). */
  clubTabletPaymentsEnabled: boolean;
  serviceChargeEnabled: boolean;
  /** Interruptor del vínculo modificador -> insumo (botón en Inventario). */
  modifierInventoryLinkEnabled: boolean;
  ivaEnabled: boolean;
  rif?: string | null;
  paymentMethodsConfig?: PaymentMethodsConfig | null;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl?: string | null;
  screenDisplayMode?: 'ALL' | 'CATEGORIES' | 'PRODUCTS';
  screenCategoryIds?: string[];
  screenProductIds?: string[];
  screenPageIntervalSec?: number;
  screenItemsPerPage?: number;
  /** Si el local cobra envío, el carrito exige la ubicación para poder calcular la zona. */
  deliveryPricingMode?: 'DISABLED' | 'DISTANCE' | 'ZONE';
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
  /** Socio: consume a cuenta y ese consumo no es una venta. Solo dueño/admin puede marcarlo. */
  isPartner?: boolean;
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
  /** Insumo que consume este modificador al venderse (null = sin vínculo). Exclusivo con preparationId. */
  inventoryItemId?: string | null;
  /** Preparación que consume este modificador al venderse (null = sin vínculo). Exclusivo con inventoryItemId. */
  preparationId?: string | null;
  /** Consumo en la unidad BASE del insumo/preparación (kg/lt/unidad), como string decimal. */
  inventoryQuantity?: string | null;
  /** Denormalizados por el backend para pintar "30 gr de Queso" sin cruzar listas. */
  inventoryItemName?: string | null;
  inventoryItemUnit?: string | null;
  preparationName?: string | null;
  preparationUnit?: string | null;
  /** Precio propio de este modificador para variantes puntuales del producto (ej. "Extra
   * queso" cuesta distinto en "Pizza Grande" que en "Pizza Pequeña"). Vacío/undefined = usa
   * `priceBase` de arriba sin importar la variante elegida — ver effectiveModifierPrice(). */
  variantPrices?: { variantId: string; priceBase: string; inventoryQuantity?: number | null }[];
  /** Variantes DE ESTE producto en las que aparece este modificador puntual (no el grupo
   * entero, ver ModifierCategory.variantIds para eso). Vacío/undefined = en todas las que ya
   * aplique el grupo — ver aplicaAlTamano/modifierAplicaAlTamano en modifierLimits.ts. */
  variantIds?: string[];
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
  /** Tamaños (variantes) de ESTE producto en los que aparece el grupo. Vacío/ausente = en todos.
   *  Solo llega dentro de un producto; en la biblioteca de Modificadores no aplica. */
  variantIds?: string[];
  /** Unidades gratis del grupo en ESTE plato: las primeras N no se cobran (las más baratas
   * primero, misma regla del servidor). Solo llega dentro de un producto. */
  freeQuantity?: number | null;
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
  /** Solo lo trae el listado de Productos (para mostrar junto a "Disponible"); el resto de
   * pantallas ya tenían kitchenId y no necesitan el nombre resuelto. */
  kitchen?: { id: string; name: string } | null;
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
  /** A partir de cuántas unidades avisar "por agotarse" (Inventario → Alertas). */
  stockMinQuantity?: number | null;
  /** Fecha de caducidad "YYYY-MM-DD" (hora de Caracas). Ver web/src/utils/expiry.ts. */
  expiryDate?: string | null;
  /** Calculado en el backend: stockControlEnabled && stockQuantity<=0. Distinto de isAvailable (manual). */
  stockDepleted?: boolean;
  // Envase: solo se cobra en pedidos DELIVERY/PICKUP. "FIXED" usa packagingFeeBase propio;
  // "INVENTORY" usa el precio de venta del insumo vinculado (packagingItemId).
  packagingMode?: 'NONE' | 'FIXED' | 'INVENTORY';
  packagingFeeBase?: string | null;
  packagingItemId?: string | null;
  /** Solo en GET /products: precio del insumo vinculado, para calcular el envase en modo INVENTORY. */
  packagingItem?: { salePriceBase: string | null } | null;
  isStar: boolean;
  isPromo: boolean;
  isHouseSpecial: boolean;
  // Promoción por tiempo: precio especial que solo aplica dentro de la ventana configurada
  // (hora / días de la semana / rango de fechas). Solo aplica a pricingMode SIMPLE.
  promoPriceEnabled?: boolean;
  promoPrice?: string | null;
  /** "HH:mm" 24h, hora de Caracas. */
  promoStartTime?: string | null;
  promoEndTime?: string | null;
  /** 0=domingo..6=sábado. Vacío = todos los días. */
  promoDaysOfWeek?: number[];
  /** "YYYY-MM-DD". */
  promoStartDate?: string | null;
  promoEndDate?: string | null;
  // Devueltos por el menú público cuando la promoción está activa ahora mismo (ver menu.service.ts):
  // `price` ya viene como el precio de promo, `originalPrice` es el normal para tacharlo.
  originalPrice?: string | null;
  onTimePromo?: boolean;
  priority: number;
  category?: { id: string; name: string };
  // "SIMPLE" = precio único (el campo price); "VARIANTS" = el cliente elige entre `variants`.
  pricingMode?: 'SIMPLE' | 'VARIANTS';
  variants?: ProductVariant[];
  // Categorías de modificadores asociadas a este producto (con sus modificadores anidados).
  modifierCategories?: ModifierCategory[];
  /** Combo pool: el cliente elige entre estos límites cuántos platos lleva (null en ambos =
   * combo fijo: las cantidades de cada componente son exactas). */
  comboMinSelections?: number | null;
  comboMaxSelections?: number | null;
  /** Combo armable: platos que lo componen, cada uno con SUS categorias de modificadores. */
  comboComponents?: ComboComponentInfo[];
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
  /** Sillas de la mesa — se dibujan alrededor en el plano del salón. */
  seats?: number;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  canAccessInventory: boolean;
  /** Solo aplica a rol Cajero — ver AuthUser.cashierFullAccess. */
  cashierFullAccess: boolean;
  /** Local Comercial: presta servicios (barbero/estilista) — aparece en "Atendido por" del POS. */
  isServiceProvider?: boolean;
  /** % que se lleva de lo que factura. Null/0 = sin comisión. */
  commissionPercent?: number | null;
  /** Sus propios datos de cobro (Pago Móvil/Zelle) — en barbería el cliente le paga directo. */
  paymentMethodsConfig?: PaymentMethodsConfig | null;
  /** true si ya tiene el PIN de 4 dígitos configurado (Pantalla de bloqueo / segundo inicio
   * de sesión de mesero). No viaja el PIN ni su hash, solo si existe. */
  hasLockPin: boolean;
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

export interface QuoteItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  items: QuoteItem[];
  totalBase: string;
  currency: 'USD' | 'EUR';
  convertedToId: string | null;
  createdAt: string;
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
  /** Planimetría: posición en % del lienzo de su zona. null = todavía sin ubicar en el plano. */
  planX: number | null;
  planY: number | null;
  planShape: 'ROUND' | 'SQUARE' | 'RECTANGLE';
  /** Factor de tamaño con que se dibuja (1 = normal). */
  planSize: number;
  /** Sillas de la mesa: se dibujan como puntitos alrededor. Solo visual. */
  seats: number;
  /** Unir mesas — en una MIEMBRO: a qué mesa principal está pegada (su cuenta vive allá). */
  mergedIntoTableId: string | null;
  /** En una PRINCIPAL: las mesas que cuelgan de ella. Vacío si no tiene ninguna. */
  mergedTableIds: string[];
  /** Números del grupo para el rótulo ("1", "2" -> "1+2"). Vacío si la mesa no es principal. */
  mergedNumbers: string[];
  /** Sillas del grupo completo (las suyas + las de sus miembros). */
  groupSeats: number;
}

export interface FloorPlan {
  zones: { id: string; name: string; tables: FloorPlanTable[] }[];
  unzoned: FloorPlanTable[];
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'SEATED' | 'NO_SHOW';

export interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  customerName: string;
  customerIdNumber: string;
  customerPhone: string;
  status: ReservationStatus;
  /** De dónde salió: del menú público o cargada por el restaurante. */
  source?: 'PUBLIC' | 'STAFF';
  note?: string | null;
  seatedAt?: string | null;
  /** Cuenta que abrió al sentarse (null mientras no se haya sentado). */
  tableSessionId?: string | null;
  /** Mesa donde se sentó de verdad — no siempre es la que tenía apartada. */
  tableSession?: { id: string; table: { id: string; number: string } } | null;
  tables: { id: string; number: string }[];
}

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';

/** Alguien esperando mesa en la puerta (sin reserva previa). */
export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  customerIdNumber?: string | null;
  partySize: number;
  zoneId?: string | null;
  zone?: { id: string; name: string } | null;
  note?: string | null;
  quotedMinutes?: number | null;
  status: WaitlistStatus;
  createdAt: string;
  notifiedAt?: string | null;
  seatedAt?: string | null;
  /** Cuánto lleva esperando (o cuánto esperó, si ya se sentó). Lo calcula el servidor. */
  waitedMinutes: number | null;
  /** Mesa donde se sentó (null si todavía espera). */
  seatedTable?: { id: string; number: string } | null;
}

export interface WaitlistResponse {
  waiting: WaitlistEntry[];
  seatedToday: WaitlistEntry[];
  stats: {
    waitingCount: number;
    avgWaitMinutes: number | null;
    longestWaitMinutes: number | null;
  };
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

export type OrderStatus = 'NEEDS_CONFIRMATION' | 'NEEDS_PAYMENT' | 'PENDING' | 'KITCHEN' | 'SERVED' | 'CANCELLED';
export type OrderChannel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS';
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
  /** Cuándo la cocina empezó a prepararlo ("En proceso"). null = todavía sin arrancar. */
  kitchenStartedAt?: string | null;
  /** Cuándo esa estación marcó su parte lista. null = todavía pendiente. */
  kitchenReadyAt?: string | null;
  /** Cuándo entró esta línea a la comanda — de ahí sale el tiempo que lleva esperando cocina. */
  createdAt?: string;
  /** Tanda dentro del pedido: 1 = la comanda original, 2+ = cada ronda añadida después. */
  kitchenBatch?: number;
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

export interface ComboComponentInfo {
  componentProductId: string;
  name: string;
  quantity: number;
  isAvailable: boolean;
  /** Tamaño fijado por el combo cuando el plato se vende por variantes ("Noodle Bar 16OZ").
   * Lo decide quien arma el combo, no el cliente — el precio del combo no se mueve. */
  variantId?: string | null;
  variantName?: string | null;
  modifierCategories: ModifierCategory[];
}

/** Una instancia armada de un plato dentro de un combo (2 wokbox = dos entradas). */
export interface ComboSelection {
  componentProductId: string;
  /** Distingue el tamaño cuando el combo trae el mismo plato en dos ("16OZ" y "26OZ"). */
  variantId?: string | null;
  modifierIds: string[];
}

export interface CartLine {
  product: Product;
  quantity: number;
  // Si el producto usa "Precio por variantes", cuál eligió el cliente.
  variantId?: string;
  variantName?: string;
  selectedModifiers: SelectedModifier[];
  /** Combo armable: cada instancia de cada plato componente ya configurada. */
  comboSelections?: ComboSelection[];
  /** Suma de los precios de los modificadores elegidos dentro del combo (para el total en pantalla). */
  comboExtraTotal?: number;
  note?: string;
}
