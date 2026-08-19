import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { isAdminCashier } from '@/utils/roles';
import { notifyNative } from '@/utils/nativeNotify';
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
  // Ids por los que ya se avisó: sin esto, cada movimiento de stock volvería a sonar por el
  // mismo insumo. Se olvida el id cuando el insumo se repone, así el próximo bajón sí avisa.
  const notifiedRef = useRef<Set<string>>(new Set());
  // El primer load es el estado que ya venía de antes, no una novedad: no debe sonar.
  const primedRef = useRef(false);
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

          const lowIds = new Set(low.map((i) => i.id));
          // Repuesto: se olvida, para que pueda volver a avisar si baja de nuevo.
          for (const id of [...notifiedRef.current]) {
            if (!lowIds.has(id)) notifiedRef.current.delete(id);
          }
          const fresh = low.filter((i) => !notifiedRef.current.has(i.id));
          fresh.forEach((i) => notifiedRef.current.add(i.id));

          if (primedRef.current && fresh.length > 0) {
            new Audio('/sounds/notification-admin.mp3').play().catch(() => {});
            void notifyNative({
              title: fresh.length === 1 ? 'Insumo por agotarse' : 'Insumos por agotarse',
              body:
                fresh.length === 1
                  ? `${fresh[0].name} está por agotarse`
                  : fresh.map((i) => i.name).slice(0, 3).join(', '),
            });
          }
          primedRef.current = true;
        })
        .catch(() => {});
    }

    load();
    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('inventory:low-stock', load);

    return () => {
      cancelled = true;
      primedRef.current = false;
      notifiedRef.current.clear();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee]);

  return items;
}
