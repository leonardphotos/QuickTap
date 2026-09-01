import { useEffect, useState } from 'react';

const QUERY = '(orientation: landscape) and (min-width: 900px)';

/** Tablet real en horizontal (no escritorio, no celular) — activa el panel operativo
 * de sidebar+POS en vez del layout móvil de siempre. Reacciona a rotar el dispositivo. */
export function useIsLandscapeTablet(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return matches;
}

const TACTIL = '(pointer: coarse)';

/** Pantalla táctil sin ratón: tablet o celular. En escritorio da false aunque el layout
 * sea POS, porque `(orientation: landscape) and (min-width: 900px)` también encaja en un
 * monitor. Sirve para bloquear el teclado nativo solo donde no hay teclado físico. */
export function useIsTactil(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(TACTIL).matches);

  useEffect(() => {
    const mql = window.matchMedia(TACTIL);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return matches;
}
