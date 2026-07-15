import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setStoredSlug, setToken } from '../api/client';
import type { Currency, PaymentMethodsConfig, RestaurantTheme, UserRole } from '../types';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthRestaurant {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  whatsappPhone?: string | null;
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
  subscriptionPlan: 'DELIVERY' | 'STARTER' | 'PRO' | 'PREMIUM' | 'CUSTOM' | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | null;
  /** Fin del período vigente (prueba o ciclo pagado). El bloqueo por vencimiento se calcula a partir de esto. */
  periodEnd: string;
  /** Bloqueo manual desde el Dashboard maestro, independiente del vencimiento. */
  suspended: boolean;
  locked: boolean;
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

  return (
    <AuthContext.Provider value={{ user, restaurant, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
