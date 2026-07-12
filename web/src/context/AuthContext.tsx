import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from '../api/client';
import type { Currency } from '../types';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthRestaurant {
  id: string;
  slug: string;
  name: string;
  whatsappPhone?: string | null;
  baseCurrency: Currency;
}

interface AuthState {
  user: AuthUser | null;
  restaurant: AuthRestaurant | null;
  loading: boolean;
  login: (slug: string, email: string, password: string) => Promise<void>;
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

  async function login(slug: string, email: string, password: string) {
    const { data } = await api.post('/auth/login', { slug, email, password });
    setToken(data.data.token);
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
    exchangeRate?: number;
  }) {
    const { data } = await api.post('/auth/register', input);
    setToken(data.data.token);
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
