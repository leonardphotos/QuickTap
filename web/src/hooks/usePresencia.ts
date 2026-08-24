import { useEffect } from 'react';
import { api } from '@/api/client';

/** Cada cuánto avisa que sigue ahí. El servidor da por ida una visita a los 45 s. */
const LATIDO_MS = 20_000;

/**
 * Avisa que hay alguien viendo la página pública de un negocio, para el contador "en la página
 * ahora" del Dashboard maestro.
 *
 * El id se genera en el propio navegador y vive en sessionStorage: sirve solo para que dos
 * pestañas de la misma visita no cuenten como dos personas. No identifica a nadie ni sale de
 * acá — el servidor solo guarda ese texto en memoria durante 45 segundos.
 *
 * Deja de latir cuando la pestaña se va al fondo: si no, un teléfono con quince pestañas
 * abiertas de ayer contaría como quince personas mirando ahora.
 */
export function usePresencia(slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    let visitorId = sessionStorage.getItem('qt_visita');
    if (!visitorId) {
      visitorId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('qt_visita', visitorId);
    }
    const latir = () => {
      if (document.visibilityState !== 'visible') return;
      api.post('/public/presence', { slug, visitorId }).catch(() => undefined);
    };
    latir();
    const id = setInterval(latir, LATIDO_MS);
    document.addEventListener('visibilitychange', latir);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', latir);
    };
  }, [slug]);
}
