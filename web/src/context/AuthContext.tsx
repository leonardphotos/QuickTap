import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setStoredSlug, setToken } from '../api/client';
import type { Currency, ExchangeRateInfo, PaymentMethodsConfig, RestaurantTheme, UserRole } from '../types';

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
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
  /** Rubro de retail (indexa web/src/data/shopRubros.ts) cuando businessType = SHOP. */
  shopRubro?: string | null;
  /** Tienda virtual del Local Comercial: tarifa plana de envío, en la moneda base. */
  shopDeliveryFee?: number | string | null;
  whatsappPhone?: string | null;
  whatsappOrderMessageTemplate?: string | null;
  baseCurrency: Currency;
  currencySymbol: string;
  exchangeRate: ExchangeRateInfo | null;
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
  /** Interruptor del vínculo modificador -> insumo (botón en Inventario). */
  modifierInventoryLinkEnabled: boolean;
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
  deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
  deliveryBaseFee: string;
  deliveryPricePerKm: string;
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
  subscriptionPlan: 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM' | 'CUSTOM' | 'SUCURSALES' | 'DELIVERY_SUCURSALES' | 'ELITE' | 'SHOP' | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | null;
  /** Fin del período vigente (prueba o ciclo pagado). El bloqueo por vencimiento se calcula a partir de esto. */
  periodEnd: string;
  /** Bloqueo manual desde el Dashboard maestro, independiente del vencimiento. */
  suspended: boolean;
  locked: boolean;
  /** Adicionales del Plan Personalizado (solo importan si subscriptionPlan = CUSTOM). */
  customAdministration: boolean;
  customInventoryBasic: boolean;
  customInventoryRecipe: boolean;
  customAccountsPayable: boolean;
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

interface AuthState {
  user: AuthUser | null;
  restaurant: AuthRestaurant | null;
  loading: boolean;
  login: (email: string, password: string, slug?: string) => Promise<void>;
  register: (input: {
    restaurantName: string;
    slug: string;
    ownerName: string;
    email: string;
    password: string;
    whatsappPhone?: string;
    baseCurrency?: Currency;
    businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
    shopRubro?: string;
  }) => Promise<void>;
  logout: () => void;
  /** "Continuar con Google": `credential` es el ID token que devuelve el botón de Google.
   * Sin cuenta existente devuelve `{ needsRegistration: true, email, name }` en vez de loguear
   * (el llamador debe pedir los datos del restaurante y volver a llamar con `registration`). */
  loginWithGoogle: (
    credential: string,
    slug?: string,
    registration?: {
      restaurantName: string;
      slug: string;
      whatsappPhone?: string;
      baseCurrency?: Currency;
      businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
      shopRubro?: string;
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
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restaurant, setRestaurant] = useState<AuthRestaurant | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data.user);
      setRestaurant(data.data.restaurant);
    } catch {
      clearToken();
      setUser(null);
      setRestaurant(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entorno Demo Efímero, capa 1 (best-effort): al cerrar la pestaña/navegador
  // no hay tiempo para un logout() normal (async), así que se manda un
  // "beacon" — una petición que el navegador garantiza intentar aunque la
  // página ya se esté descargando. No es 100% garantizado (por eso existe el
  // barrido de inactividad en el backend como red de seguridad), pero cubre
  // la gran mayoría de los cierres normales de pestaña/navegador.
  const isDemoRef = useRef(false);
  isDemoRef.current = restaurant?.isDemo ?? false;
  useEffect(() => {
    function sendLogoutBeacon() {
      if (!isDemoRef.current) return;
      const token = getToken();
      if (!token) return;
      const body = new Blob([JSON.stringify({ token })], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/auth/logout', body);
    }
    window.addEventListener('pagehide', sendLogoutBeacon);
    return () => window.removeEventListener('pagehide', sendLogoutBeacon);
  }, []);

  async function login(email: string, password: string, slug?: string) {
    const { data } = await api.post('/auth/login', { email, password, slug });
    setToken(data.data.token);
    setStoredSlug(data.data.restaurant.slug);
    setUser(data.data.user);
    setRestaurant(data.data.restaurant);
  }

  async function register(input: {
    restaurantName: string;
    slug: string;
    ownerName: string;
    email: string;
    password: string;
    whatsappPhone?: string;
    baseCurrency?: Currency;
    businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
    shopRubro?: string;
  }) {
    const { data } = await api.post('/auth/register', input);
    setToken(data.data.token);
    setStoredSlug(data.data.restaurant.slug);
    setUser(data.data.user);
    setRestaurant(data.data.restaurant);
  }

  async function loginWithGoogle(
    credential: string,
    slug?: string,
    registration?: {
      restaurantName: string;
      slug: string;
      whatsappPhone?: string;
      baseCurrency?: Currency;
      businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
      shopRubro?: string;
    },
  ) {
    const { data } = await api.post('/auth/google', { credential, slug, registration });
    if (data.data.needsRegistration) {
      return data.data as { needsRegistration: true; email: string; name: string };
    }
    setToken(data.data.token);
    setStoredSlug(data.data.restaurant.slug);
    setUser(data.data.user);
    setRestaurant(data.data.restaurant);
    return {};
  }

  function logout() {
    // Entorno Demo Efímero: si esta era la cuenta demo, este POST dispara el
    // reset inmediato en el backend (ver auth.service.ts logout()) — best
    // effort, no bloquea el logout si falla.
    api.post('/auth/logout').catch(() => undefined);
    clearToken();
    setUser(null);
    setRestaurant(null);
  }

  // Cambiar de sede reemplaza el tenant activo de arriba a abajo (pedidos,
  // productos, mesas, sockets...), así que en vez de solo actualizar el
  // estado se recarga la app entera con el token nuevo ya guardado.
  async function switchToBranch(branchId: string) {
    const { data } = await api.post(`/branches/${branchId}/switch`);
    setToken(data.data.token);
    window.location.href = '/admin';
  }

  async function switchToParent() {
    const { data } = await api.post('/branches/switch-to-parent');
    setToken(data.data.token);
    window.location.href = '/admin';
  }

  async function setLockPin(pin: string) {
    await api.patch('/auth/lock-pin', { pin });
    await refresh();
  }

  async function verifyLockPin(pin: string) {
    const { data } = await api.post('/auth/verify-lock-pin', { pin });
    return !!data.data.valid;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        restaurant,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        refresh,
        switchToBranch,
        switchToParent,
        setLockPin,
        verifyLockPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
