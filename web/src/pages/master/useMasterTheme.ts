import { useEffect } from 'react';

/** Tema claro del máster, también en los diálogos montados fuera del panel. */
export function useMasterTheme() {
  useEffect(() => {
    document.body.classList.add('master-theme');
    return () => document.body.classList.remove('master-theme');
  }, []);
}
