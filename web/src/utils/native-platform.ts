import { Capacitor } from '@capacitor/core';
import { isElectron } from './electronBridge';

/**
 * Si estamos dentro de la app instalada de Android (no el navegador).
 *
 * Se pregunta por la plataforma concreta y no por `isNativePlatform()` porque la app de
 * escritorio también corre sobre Capacitor y se detecta de otra forma (ver abajo).
 *
 * Funciona aunque la app abra el sitio en vivo en vez de una copia empaquetada: Capacitor
 * inyecta su puente en el WebView sin importar de qué origen venga la página.
 */
export function isAndroidApp(): boolean {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    // En el navegador el puente no existe; ante cualquier duda, comportarse como la web.
    return false;
  }
}

/**
 * Si estamos en una app instalada — Android o el escritorio de Windows — y no en el navegador.
 *
 * En escritorio NO sirve preguntarle la plataforma a Capacitor: el plugin de Electron no la
 * declara en el renderer y ahí `getPlatform()` responde `web` igual que un navegador. La señal
 * buena es `window.electronBridge`, que expone nuestro propio preload.
 */
export function isInstalledApp(): boolean {
  return isAndroidApp() || isElectron;
}
