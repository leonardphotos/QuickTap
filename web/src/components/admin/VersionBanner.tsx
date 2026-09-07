import { useVersionCheck } from '@/hooks/useVersionCheck';

/**
 * Aviso de que esta pestaña quedó desactualizada tras un despliegue — ver useVersionCheck. No
 * No interrumpe el trabajo: al refrescar la página, el navegador carga automáticamente el
 * build nuevo gracias a los archivos versionados de Vite.
 */
export function VersionBanner() {
  const outdated = useVersionCheck();
  if (!outdated) return null;

  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-brand-500 text-white">
      <span>Hay una actualización disponible. Refresca la página para aplicarla.</span>
    </div>
  );
}
