import type { ReactNode } from 'react';
import { useEffect,useState } from 'react';
import { MoneyVisibilityContext } from './MoneyVisibilityContext.shared';

const STORAGE_KEY = 'quicktap_master_hide_amounts';

/**
 * Ocultar/mostrar montos de dinero en todo el Dashboard maestro (ej. al
 * compartir pantalla). Un solo estado compartido: cualquier ícono de ojo
 * en cualquier página lo cambia para todos a la vez. Se recuerda entre
 * sesiones (localStorage) para que no vuelva a mostrar montos solo por
 * refrescar la página.
 */
export function MoneyVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(hidden));
  }, [hidden]);

  return (
    <MoneyVisibilityContext.Provider value={{ hidden, toggle: () => setHidden((h) => !h) }}>
      {children}
    </MoneyVisibilityContext.Provider>
  );
}
