import { CloudOff, WifiOff } from 'lucide-react';
import { useConnectivity } from '@/hooks/useConnectivity';

/**
 * Aviso de que la app no está hablando con la nube. Sin esto, el modo sin conexión sería
 * invisible: el mesero seguiría trabajando sin saber que sus pedidos están en la PC del local
 * esperando a subir, ni por qué el delivery dejó de entrar.
 */
export function ConnectivityBanner() {
  const state = useConnectivity();
  if (state === 'online') return null;

  const relay = state === 'relay';
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold ${
        relay ? 'bg-amber-500 text-amber-950' : 'bg-red-600 text-white'
      }`}
    >
      {relay ? <CloudOff className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      {relay ? (
        <span>
          Sin internet — trabajando con el servidor del local. Los pedidos se suben solos cuando
          vuelva la conexión. El delivery no entra mientras tanto.
        </span>
      ) : (
        <span>Sin conexión con el servidor. No se pueden tomar pedidos en este momento.</span>
      )}
    </div>
  );
}
