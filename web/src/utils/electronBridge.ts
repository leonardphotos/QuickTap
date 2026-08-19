/**
 * Puente hacia la app de escritorio (Electron). Fuera de Electron (navegador normal,
 * futura app Android) `window.electronBridge` no existe — todas las funciones de acá
 * se vuelven no-ops seguros, así el resto del código puede llamarlas siempre sin
 * chequear la plataforma en cada punto de uso.
 */

interface ElectronBridge {
  isElectron: true;
  notify: (payload: { title: string; body: string }) => void;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.electronBridge?.isElectron;

/** Notificación nativa del sistema operativo (aparece aunque la ventana esté minimizada
 * o sin foco) — en navegador/Android no hace nada, ahí el aviso lo maneja cada pantalla
 * con su propio banner/sonido (ver NewOrderAlert.tsx). */
export function notifyDesktop(payload: { title: string; body: string }) {
  window.electronBridge?.notify(payload);
}
