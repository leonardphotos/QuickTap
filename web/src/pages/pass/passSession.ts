/**
 * Sesión de QuickTap Pass, guardada aparte de la del panel y la del dashboard maestro.
 *
 * Clave propia a propósito: un cliente y un dueño de negocio pueden usar el mismo teléfono o
 * la misma computadora, y compartir la clave haría que entrar a uno cerrara la sesión del otro.
 */
const KEY = 'quicktap_pass_token';

export function getPassToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setPassToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearPassToken(): void {
  localStorage.removeItem(KEY);
}
