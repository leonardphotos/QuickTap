import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setStoredSlug, setToken } from '../api/client';
import type { Currency, PaymentMethodsConfig, RestaurantTheme, UserRole } from '../types';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  canAccessInventory: boolean;
}

interface AuthRestaurant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  whatsappPhone?: string | null;
  whatsappOrderMessageTemplate?: string | null;
  baseCurrency: Currency;
  theme?: RestaurantTheme | null;
  serviceChargeEnabled: boolean;
  ivaEnabled: boolean;
  orderingEnabled: boolean;
  requireOrderConfirmation: boolean;
  deliveryOriginLat: number | null;
  deliveryOriginLng: number | null;
  deliveryPricingMode: 'DISABLED' | 'DISTANCE' | 'ZONE';
  deliveryBaseFee: string;
  deliveryPricePerKm: string;
  paymentMethodsConfig?: PaymentMethodsConfig | null;
  fullscreenImageEnabled: boolean;
  fullscreenImageUrl?: string | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM' | 'CUSTOM' | 'SUCURSALES' | 'DELIVERY_SUCURSALES' | null;
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
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Cambia la sesión activa hacia una sucursal (ver src/modules/branches/). Recarga la app. */
  switchToBranch: (branchId: string) => Promise<void>;
  /** Inverso: de una sucursal, vuelve a la sesión de la sede principal. Recarga la app. */
  switchToParent: () => Promise<void>;
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
  }) {
    const { data } = await api.post('/auth/register', input);
    setToken(data.data.token);
    setStoredSlug(data.data.restaurant.slug);
    setUser(data.data.user);
    setRestaurant(data.data.restaurant);
  }

  function logout() {
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

  return (
    <AuthContext.Provider
      value={{ user, restaurant, loading, login, register, logout, refresh, switchToBranch, switchToParent }}
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
