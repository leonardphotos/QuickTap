import { currentOrigin } from './connectivity';

/**
 * A qué backend le habla la app AHORA.
 *
 * Antes era una constante fija. Ahora puede cambiar en caliente: si se cae el internet del
 * local y hay un relé configurado, apunta al relé para que el salón siga trabajando (ver
 * `connectivity.ts`).
 *
 * En el navegador normal con internet devuelve cadena vacía, igual que siempre — las rutas
 * relativas funcionan porque Nginx (o el proxy de Vite en dev) sirve la SPA y la API bajo el
 * mismo origen.
 *
 * Es una función y no una constante a propósito: si fuera constante, cada componente
 * capturaría el valor que hubiera al importar el módulo y seguiría hablándole a la nube caída.
 */
export function apiOrigin(): string {
  return currentOrigin();
}
