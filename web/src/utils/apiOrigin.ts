import { Capacitor } from '@capacitor/core';

/**
 * En el navegador (web normal) las rutas relativas (`/api/v1`, `io('/')`) funcionan porque
 * Nginx en producción — y el proxy de Vite en dev — sirven la SPA y la API bajo el mismo
 * origen. La app empaquetada (Electron hoy, Android más adelante) NO tiene ese proxy: cada
 * request necesita el origen absoluto del backend. `VITE_DESKTOP_API_ORIGIN` permite apuntar
 * a otro backend (staging) sin tocar código; por defecto apunta a producción.
 */
export const API_ORIGIN = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_DESKTOP_API_ORIGIN ?? 'https://quicktap.club')
  : '';
