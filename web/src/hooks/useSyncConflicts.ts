import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { isAdminCashier } from '@/utils/roles';
import type { UserRole } from '@/types';

/**
 * Cuántos pedidos de un corte de internet quedan por revisar.
 *
 * Sirve para que la sección solo aparezca en el menú cuando de verdad hay algo que mirar: en
 * un restaurante que nunca perdió la conexión, esa entrada nunca estorba.
 */
export function useSyncConflictsCount(role: UserRole | null | undefined, cashierFullAccess?: boolean): number {
  const [count, setCount] = useState(0);
  const canSee = isAdminCashier(role, cashierFullAccess);

  useEffect(() => {
    if (!canSee) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .get('/offline/conflicts')
        .then((res) => {
          if (!cancelled) setCount((res.data.data as unknown[]).length);
        })
        .catch(() => undefined);
    load();
    // Un corte no es algo de cada minuto: con revisar de vez en cuando alcanza.
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canSee]);

  return count;
}
