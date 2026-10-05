import { api } from '@/api/client';

/** Métricas mínimas por etapa, sin contenido de campos ni parámetros de la URL. */

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

}

export function trackFunnel(payload: FunnelPayload): void {
  void api.post('/public/registration-funnel', { sessionId: funnelSessionId(), stage: payload.stage, businessType: payload.businessType }).catch(() => undefined);
}
