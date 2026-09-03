import axios from 'axios';
import { apiOrigin } from '@/utils/apiOrigin';

/**
 * Cliente axios base. En dev, Vite proxea /api hacia el backend (puerto 4000); en la app
 * empaquetada (Electron/Android) no hay proxy, así que se antepone el origen absoluto.
 *
 * El origen se resuelve EN CADA petición, no al crear el cliente: si se cae el internet y la
 * app se pasa al relé local, las peticiones siguientes van solas al relé sin recrear nada
 * (ver utils/connectivity.ts).
 *
 * El timeout es imprescindible acá: sin él, con la nube caída cada petición quedaba colgada
 * para siempre y la app parecía congelada en vez de cambiarse al relé.
 */
const REQUEST_TIMEOUT_MS = 12000;

/**
 * Timeout para las llamadas que esperan a la IA (leer una carta, un inventario o un recetario,
 * armar fichas técnicas). Son trabajos de minutos, no peticiones normales: leer el inventario
 * de 18 hojas de un cliente son ~80 segundos de Gemini. Con los 12 segundos de siempre, el
 * navegador cortaba la petición mientras el servidor seguía trabajando y el operador veía un
 * error de red aunque la lectura terminara bien.
 */
export const AI_TIMEOUT_MS = 600000;

export const api = axios.create({ timeout: REQUEST_TIMEOUT_MS });

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
  config.baseURL = `${apiOrigin()}/api/v1`;
  const token = getToken();
  // Si la llamada ya trae su propio Authorization (ej. QuickTap Wallet, que guarda su token
  // aparte del de negocio — ver passSession.ts) no se pisa: en el mismo navegador puede haber
  // a la vez una sesión de negocio y una de Wallet, y esto rompía Wallet por completo cada vez
  // coincidían, mandando el JWT del negocio en vez del de Pass.
  if (token && !config.headers.Authorization) {
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
// El dashboard maestro siempre habla con la nube: no tiene sentido en modo relé.
export const masterApi = axios.create({ timeout: REQUEST_TIMEOUT_MS });

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
  config.baseURL = `${apiOrigin()}/api/v1`;
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
