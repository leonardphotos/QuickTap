import { useEffect, useState } from 'react';

/** Cada cuánto se revisa si hay una versión nueva del panel — no hace falta más seguido: el
 * aviso solo importa para sesiones largas (una tablet que queda abierta todo el turno), no
 * para quien recién entró. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Avisa cuando el build servido cambió desde que se cargó esta pestaña — una SPA no se entera
 * sola de un despliegue nuevo, así que sin esto una pestaña abierta desde antes sigue corriendo
 * el JS viejo indefinidamente. El síntoma es confuso: un arreglo que "no funcionó" cuando en
 * realidad nunca llegó a esa pestaña (pasó con la Estación de Impresión y con el panel de
 * Pedidos el mismo día). No recarga sola — deja la decisión al usuario, que puede tener algo
 * sin guardar (un formulario a medio llenar, un carrito armado).
 */
export function useVersionCheck(): boolean {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.buildId && data.buildId !== __APP_BUILD_ID__) setOutdated(true);
      } catch {
        // Sin internet, o el archivo no existe (ej. `npm run dev` local) — no es un aviso real.
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return outdated;
}
