import type { ReactNode } from 'react';
import { useEffect,useRef,useState } from 'react';
import { api,clearToken,getToken,setStoredSlug,setToken } from '../api/client';
import type { Currency } from '../types';
import { AuthContext,type AuthRestaurant,type AuthUser } from './AuthContext.shared';

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
      termsAccepted: true;
    restaurantName: string;
      slug: string;
      whatsappPhone?: string;
      baseCurrency?: Currency;
      businessType?: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
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

  async function switchableWaiters() {
    const { data } = await api.get('/auth/switchable-waiters');
    return data.data as { id: string; name: string }[];
  }

  // Mismo criterio que switchToBranch: cambia de identidad dentro del mismo restaurante, así
  // que hay estado por-usuario disperso por toda la app (sockets con el JWT viejo en el
  // handshake, listas ya cargadas, etc.) — recargar entero es lo único que garantiza que todo
  // arranque limpio con el mesero nuevo.
  async function switchUser(userId: string, pin: string) {
    const { data } = await api.post('/auth/switch-user', { userId, pin });
    setToken(data.data.token);
    window.location.href = '/admin';
  }

  async function identifyWaiterByPin(pin: string) {
    const { data } = await api.post('/auth/identify-waiter', { pin });
    setToken(data.data.token);
    window.location.href = '/admin';
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
        switchableWaiters,
        switchUser,
        identifyWaiterByPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
