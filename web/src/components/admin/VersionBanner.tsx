import { RefreshCw } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';

/**
 * Aviso de que esta pestaña quedó desactualizada tras un despliegue — ver useVersionCheck. No
 * recarga sola: deja el botón para cuando el que está trabajando pueda soltar lo que tiene sin
 * guardar.
 */
export function VersionBanner() {
  const outdated = useVersionCheck();
  if (!outdated) return null;

  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-brand-500 text-white">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>Hay una actualización disponible.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="underline underline-offset-2 font-bold"
      >
        Recargar
      </button>
    </div>
  );
}
