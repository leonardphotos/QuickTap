import { useEffect, useState } from 'react';
import {
  getConnectivity,
  onConnectivityChange,
  startConnectivityWatch,
  type ConnectivityState,
} from '@/utils/connectivity';

/**
 * Estado de conexión de la app: nube, relé local, o sin nada.
 *
 * Arranca el vigilante la primera vez que se usa (es idempotente, no importa cuántas pantallas
 * lo llamen). Los componentes que abren sockets deben meter este valor en las dependencias de
 * su `useEffect`: al cambiar el destino hay que reconectar, o el socket se queda hablándole a
 * un servidor que ya no responde.
 */
export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(getConnectivity);

  useEffect(() => {
    startConnectivityWatch();
    return onConnectivityChange(setState);
  }, []);

  return state;
}
