/**
 * Sesión de QuickTap Wallet, guardada aparte de la del panel y la del dashboard maestro.
 *
 * Clave propia a propósito: un cliente y un dueño de negocio pueden usar el mismo teléfono o
 * la misma computadora, y compartir la clave haría que entrar a uno cerrara la sesión del otro.
 */
const KEY = 'quicktap_wallet_token';
/** Clave con la que se guardaba cuando el producto se llamaba QuickTap Pass. */
const KEY_LEGACY = 'quicktap_pass_token';

export function getWalletToken(): string | null {
  const actual = localStorage.getItem(KEY);
  if (actual) return actual;
  // Sesión abierta antes del cambio de nombre: se muda a la clave nueva en vez de obligar a
  // entrar de nuevo. Un token de Wallet dura 30 días, así que sin esto el cambio de marca
  // habría sacado del portal a todo el que tuviera sesión.
  const viejo = localStorage.getItem(KEY_LEGACY);
  if (viejo) {
    localStorage.setItem(KEY, viejo);
    localStorage.removeItem(KEY_LEGACY);
    return viejo;
  }
  return null;
}

export function setWalletToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearWalletToken(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY_LEGACY);
}
