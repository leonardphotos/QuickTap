import { Component } from 'react';
import type { ReactNode } from 'react';

const RELOADED_KEY = 'qt_chunk_reload_at';

/** ¿El error es "el archivo JS de este chunk ya no existe en el servidor"? Pasa cada vez que se
 * despliega una versión nueva mientras alguien tenía una pestaña vieja abierta: el build borra
 * los chunks de la versión anterior, y el `import()` dinámico de esa pestaña vieja apunta a un
 * archivo que el servidor ya no tiene. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
}

/** Para un error de chunk viejo, la solución real es recargar la pestaña (trae el index.html y
 * los chunks de la versión actual) — no hay nada que "reintentar" en memoria. Se recarga como
 * máximo una vez por sesión de pestaña para no entrar en bucle si el error es de otro tipo. */
function reloadOnceForChunkError(): boolean {
  const alreadyTried = sessionStorage.getItem(RELOADED_KEY);
  if (alreadyTried) return false;
  sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Red de seguridad de último recurso: sin esto, cualquier error de render sin capturar (un
 * chunk viejo tras un despliegue, o cualquier excepción de un componente) deja la pantalla
 * completamente en blanco, sin rastro para el usuario ni para nosotros. Con esto, un chunk
 * viejo se recupera solo (recarga automática); cualquier otro error muestra un mensaje con
 * botón de recargar en vez de una pantalla vacía.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6 bg-white">
          <div className="text-center max-w-sm">
            <p className="text-lg font-semibold text-brand-950 mb-2">Algo salió mal</p>
            <p className="text-sm text-brand-950/60 font-light mb-5">
              Hubo un problema al cargar esta página. Intenta recargar.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-brand-500 text-white text-sm font-semibold px-6 py-2.5"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
