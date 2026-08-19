import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { api, getToken } from '@/api/client';
import { isAdminCashier } from '@/utils/roles';
import type { UserRole } from '@/types';

/** Cantidad de reservas PENDING en vivo, para prender en rojo el acceso directo a Reservas
 * desde cualquier pantalla del panel (dock flotante y barra superior). */
export function usePendingReservationsCount(role: UserRole | null | undefined, cashierFullAccess?: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdminCashier(role, cashierFullAccess)) {
      setCount(0);
      return;
    }
    let cancelled = false;

    function load() {
      api
        .get('/reservations')
        .then((res) => {
          if (cancelled) return;
          const pending = (res.data.data as { status: string }[]).filter((r) => r.status === 'PENDING').length;
          setCount(pending);
        })
        .catch(() => {});
    }

    load();
    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('reservation:new', load);
    socket.on('reservation:updated', load);

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [role, cashierFullAccess]);

  return count;
}
