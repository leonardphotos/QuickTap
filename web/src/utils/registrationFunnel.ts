import { api } from '@/api/client';

/**
 * Seguimiento del embudo de registro (ver src/modules/registration-funnel).
 *
 * Mide cuánta gente entra a la pasarela y no termina de registrarse, y guarda lo que alcanzó a
 * escribir para poder contactarla después. La contraseña NUNCA se manda — no está en ninguna de
 * las llamadas de acá, y no debe agregarse.
 *
 * Todo es "mejor esfuerzo": ningún error de esto puede verse en la pantalla de alguien que se
 * está registrando, por eso cada llamada traga sus errores y nunca se espera con await.
 */

const KEY = 'quicktap_funnel_session';

/**
 * Id del intento actual, en sessionStorage (no localStorage): cerrar la pestaña cierra el
 * intento, así volver mañana cuenta como un intento nuevo y no revive uno viejo ya abandonado.
 */
export function funnelSessionId(): string {
  try {
    const guardado = sessionStorage.getItem(KEY);
    if (guardado) return guardado;
    const nuevo = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, nuevo);
    return nuevo;
  } catch {
    // Modo privado / storage bloqueado: se sigue midiendo con un id de una sola vez.
    return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface FunnelPayload {
  stage?: 'START' | 'FORM';
  businessType?: string;
  shopRubro?: string;
  restaurantName?: string;
  slug?: string;
  whatsappPhone?: string;
  ownerName?: string;
  email?: string;
  landingQuery?: string;
  lastError?: string;
}

export function trackFunnel(payload: FunnelPayload): void {
  void api.post('/public/registration-funnel', { sessionId: funnelSessionId(), ...payload }).catch(() => undefined);
}
