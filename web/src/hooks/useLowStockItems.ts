import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { isAdminCashier } from '@/utils/roles';
import type { UserRole } from '@/types';

export interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
}

/** Insumos en (o por debajo de) su stock mínimo, en vivo — para el aviso de "se está agotando"
 * en Caja/Administrador/Dueño y en el Mesero al que se le asignó acceso a Inventario. */
export function useLowStockItems(
  role: UserRole | null | undefined,
  canAccessInventory: boolean | undefined,
  cashierFullAccess?: boolean,
): LowStockItem[] {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const canSee =
    isAdminCashier(role, cashierFullAccess) || ((role === 'WAITER' || role === 'CASHIER') && !!canAccessInventory);

  useEffect(() => {
    if (!canSee) {
      setItems([]);
      return;
    }
    let cancelled = false;

    function load() {
      api
        .get('/inventory')
        .then((res) => {
          if (cancelled) return;
          const low = (res.data.data as LowStockItem[]).filter((i) => Number(i.quantity) < Number(i.minQuantity));
          setItems(low);
        })
        .catch(() => {});
    }

    load();
    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('inventory:low-stock', load);

    return () => {
      cancelled = true;
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee]);

  return items;
}
