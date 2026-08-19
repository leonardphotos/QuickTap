import { Capacitor } from '@capacitor/core';

/**
 * Si estamos dentro de la app instalada de Android (no el navegador, no la app de escritorio).
 *
 * Se pregunta por la plataforma concreta y no por `isNativePlatform()` porque la app de
 * escritorio también corre sobre Capacitor: ahí sí queremos el comportamiento normal del sitio.
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
