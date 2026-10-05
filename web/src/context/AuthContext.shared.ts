import { createContext,useContext } from 'react';
import type { Currency,ExchangeRateInfo,PaymentMethodsConfig,RestaurantTheme,UserRole } from '../types';


export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  canAccessInventory: boolean;
  /** Solo aplica a rol Cajero: otorgado desde Ajustes → Equipo, le devuelve el acceso completo
   * de antes (por defecto Cajero tiene el mismo acceso que Mesero + caja/movimientos del día). */
  cashierFullAccess: boolean;
  /** true si ya configuró su PIN de 4 dígitos de la Pantalla de bloqueo (obligatorio). */
  hasLockPin: boolean;
}


export interface AuthRestaurant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  /** Vertical de negocio elegido al registrarse (ver /empezar). SHOP renderiza un panel
   * completamente distinto (ver AdminLayout -> ShopLayout), no editable desde Ajustes. */
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
  /** Rubro de retail (indexa web/src/data/shopRubros.ts) cuando businessType = SHOP. */
  shopRubro?: string | null;
  /** Tienda virtual del Local Comercial: tarifa plana de envío, en la moneda base. */
  shopDeliveryFee?: number | string | null;
  whatsappPhone?: string | null;
  whatsappOrderMessageTemplate?: string | null;
  baseCurrency: Currency;
  currencySymbol: string;
  exchangeRate: ExchangeRateInfo | null;
  /** Doble precio (Local Comercial): tasa propia para Pago Móvil/Transferencia en el POS de
   * Shop — null = sin configurar, esos métodos usan la tasa de referencia como siempre. */
  shopBsSaleRate: number | null;
  theme?: RestaurantTheme | null;
  /** Cuántos clubes deportivos vinculados le mandan pedidos de sus canchas. En 0
   * (lo normal) la pestaña "Canchas" no existe — ver nav-links.ts. */
  linkedClubs: number;
  /** Entorno Demo Efímero: cuenta de demostración, se resetea sola al cerrar sesión. */
  isDemo: boolean;
  /** Modo administrador activado (código de 4 dígitos en Ajustes): exime del reset automático. */
  demoAdminUnlocked: boolean;
  /** Plan Sucursales: "PER_BRANCH" (de siempre, cada sede su propio stock) o "SHARED" (una
   * sola bolsa de stock para todas las sedes del grupo). Solo se cambia desde la sede principal. */
  inventoryMode: 'PER_BRANCH' | 'SHARED';
  /** Activa la ventana "Casa Matriz" (segundo inventario para distribuir a las sedes). */
  casaMatrizEnabled: boolean;
  serviceChargeEnabled: boolean;
  serviceChargeChannels: Array<'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR' | 'EXPRESS'>;
  /** Interruptor del vínculo modificador -> insumo (botón en Inventario). */
  modifierInventoryLinkEnabled: boolean;
  /** Bloquear pedidos cuando no queda stock del producto. */
  blockOrdersWithoutStock: boolean;
  lockScreenEnabled: boolean;
  ivaEnabled: boolean;
  /** RIF fiscal del restaurante, informativo — condición para que QuickTap pueda activar el IVA. */
  rif?: string | null;
  orderingEnabled: boolean;
  requireOrderConfirmation: boolean;
  /** Si es false, la tablet de la cancha deja de ofrecer "Pagar" (solo detalle de cuenta). */
  clubTabletPaymentsEnabled: boolean;
  deliveryOriginLat: number | null;
  deliveryOriginLng: number | null;
  deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'DISTANCE_TIERS' | 'ZONE';
  deliveryBaseFee: string;
  deliveryPricePerKm: string;
  deliveryDistanceRates: { upToKm: number; price: number }[];
  deliveryAutoOpenOnPaid: boolean;
  deliveryAutoAssignOnPaid: boolean;
  deliveryAutoAssignOnAccept: boolean;
  paymentMethodsConfig?: PaymentMethodsConfig | null;
  /** CRM: exigir nombre y teléfono del cliente en toda venta (POS del Local, delivery). */
  requireCustomerData: boolean;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl?: string | null;
  /** Ajustes -> Pantalla: qué muestra el carrusel del rol SCREEN (ver ScreenPage.tsx). */
  screenDisplayMode: 'ALL' | 'CATEGORIES' | 'PRODUCTS';
  screenCategoryIds: string[];
  screenProductIds: string[];
  screenPageIntervalSec: number;
  screenItemsPerPage: number;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: 'ESSENTIAL' | 'OPERATIONS' | 'CONTROL' | 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM' | 'CUSTOM' | 'SUCURSALES' | 'DELIVERY_SUCURSALES' | 'ELITE' | 'SHOP' | 'ELITE_SHOP' | 'CLUB' | 'OFFICE' | null;
  pendingDowngradePlan?: string | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | null;
  /** Fin del período vigente (prueba o ciclo pagado). El bloqueo por vencimiento se calcula a partir de esto. */
  periodEnd: string;
  /** Bloqueo manual desde el Dashboard maestro, independiente del vencimiento. */
  suspended: boolean;
  locked: boolean;
  /** Adicionales del Plan Personalizado (solo importan si subscriptionPlan = CUSTOM). */
  membershipTerms?: unknown;
  signupPromotionVersion?: string | null;
  signupPromotionMonthsUsed?: number;
  customAdministration: boolean;
  customInventoryBasic: boolean;
  customInventoryRecipe: boolean;
  customAccountsPayable: boolean;
  /** Shop pagado antes de Elite Shop: acceso completo hasta esta fecha (ver hasFeature). */
  legacyFullAccessUntil?: string | null;
  /** Si esta cuenta es una sucursal, el id de su sede principal (ver src/modules/branches/). */
  parentRestaurantId?: string | null;
  /** Plan que acaba de activarse y todavía no se le mostró la pantalla de bienvenida. */
  pendingWelcomePlan?: string | null;
  /** true si Dueño/Admin ya crearon el código de 6 dígitos para eliminar comandas (Ajustes). */
  hasDeleteOrderPin: boolean;
  /** Pantalla de bloqueo → minutos de inactividad por rol (Ajustes, solo Dueño/Admin). Un rol
   * ausente usa DEFAULT_LOCK_SCREEN_MINUTES (ver web/src/utils/roles.ts). */
  lockScreenIntervals: Record<string, number>;
}


export interface AuthState {
  user: AuthUser | null;
  restaurant: AuthRestaurant | null;
  loading: boolean;
  login: (email: string, password: string, slug?: string) => Promise<void>;
  register: (input: {
    termsAccepted: true;
    restaurantName: string;
    slug: string;
    ownerName: string;
    email: string;
    password: string;
    whatsappPhone?: string;
    baseCurrency?: Currency;
    businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
    shopRubro?: string;
    /** Cierra el intento de registro que venía siguiéndose (ver registrationFunnel.ts). */
    funnelSessionId?: string;
  }) => Promise<void>;
  logout: () => void;
  /** "Continuar con Google": `credential` es el ID token que devuelve el botón de Google.
   * Sin cuenta existente devuelve `{ needsRegistration: true, email, name }` en vez de loguear
   * (el llamador debe pedir los datos del restaurante y volver a llamar con `registration`). */
  loginWithGoogle: (
    credential: string,
    slug?: string,
    registration?: {
      termsAccepted: true;
    restaurantName: string;
      slug: string;
      whatsappPhone?: string;
      baseCurrency?: Currency;
      businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
      shopRubro?: string;
      funnelSessionId?: string;
    },
  ) => Promise<{ needsRegistration: true; email: string; name: string } | { needsRegistration?: undefined }>;
  refresh: () => Promise<void>;
  /** Cambia la sesión activa hacia una sucursal (ver src/modules/branches/). Recarga la app. */
  switchToBranch: (branchId: string) => Promise<void>;
  /** Inverso: de una sucursal, vuelve a la sesión de la sede principal. Recarga la app. */
  switchToParent: () => Promise<void>;
  /** Pantalla de bloqueo: crea/cambia el PIN de 4 dígitos del usuario actual. */
  setLockPin: (pin: string) => Promise<void>;
  /** Pantalla de bloqueo: valida el PIN del usuario actual contra el que tiene guardado. */
  verifyLockPin: (pin: string) => Promise<boolean>;
  /** Segundo inicio de sesión (tablet compartida): meseros de este restaurante que pueden
   * aparecer en la cuadrícula — solo los que ya tienen su PIN configurado. */
  switchableWaiters: () => Promise<{ id: string; name: string }[]>;
  /** Cambia la sesión activa a OTRO mesero del mismo restaurante, con su PIN de 4 dígitos —
   * sin pedir correo/clave. Recarga la app, igual que switchToBranch. */
  switchUser: (userId: string, pin: string) => Promise<void>;
  /** Tablet de Meseros: identifica al mesero SOLO por su PIN de 4 dígitos, sin elegir nombre.
   * Recarga la app, igual que switchUser. */
  identifyWaiterByPin: (pin: string) => Promise<void>;
}


export const AuthContext = createContext<AuthState | null>(null);


export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
