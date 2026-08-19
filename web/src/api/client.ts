import axios from 'axios';
import { API_ORIGIN } from '@/utils/apiOrigin';

/** Cliente axios base. En dev, Vite proxea /api hacia el backend (puerto 4000); en la app
 * empaquetada (Electron/Android) no hay proxy, así que API_ORIGIN agrega el origen absoluto. */
export const api = axios.create({ baseURL: `${API_ORIGIN}/api/v1` });

const TOKEN_KEY = 'quicktap_token';
const SLUG_KEY = 'quicktap_slug';
const REMEMBER_EMAIL_KEY = 'quicktap_remember_email';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Slug del último restaurante usado en este navegador, para no pedirlo de nuevo al iniciar sesión. */
export function getStoredSlug(): string | null {
  return localStorage.getItem(SLUG_KEY);
}

export function setStoredSlug(slug: string): void {
  localStorage.setItem(SLUG_KEY, slug);
}

/**
 * "Recordarme" del login: solo guarda el email (nunca la contraseña en texto
 * plano — eso queda en manos del gestor de contraseñas del propio navegador,
 * vía los atributos autoComplete del formulario).
 */
export function getRememberedEmail(): string | null {
  return localStorage.getItem(REMEMBER_EMAIL_KEY);
}

export function setRememberedEmail(email: string): void {
  localStorage.setItem(REMEMBER_EMAIL_KEY, email);
}

export function clearRememberedEmail(): void {
  localStorage.removeItem(REMEMBER_EMAIL_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(err);
  },
);

// --- Dashboard maestro (equipo de QuickTap) ---
// Instancia aparte con su propio token: un admin de plataforma puede tener
// abierta a la vez una sesión de restaurante en el mismo navegador.
export const masterApi = axios.create({ baseURL: `${API_ORIGIN}/api/v1` });

const MASTER_TOKEN_KEY = 'quicktap_master_token';

export function getMasterToken(): string | null {
  return localStorage.getItem(MASTER_TOKEN_KEY);
}

export function setMasterToken(token: string): void {
  localStorage.setItem(MASTER_TOKEN_KEY, token);
}

export function clearMasterToken(): void {
  localStorage.removeItem(MASTER_TOKEN_KEY);
}

masterApi.interceptors.request.use((config) => {
  const token = getMasterToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

masterApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearMasterToken();
    }
    return Promise.reject(err);
  },
);
