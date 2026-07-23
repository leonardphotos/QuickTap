import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { BellRing, Receipt } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { ServiceRequestType, TableItem } from '@/types';

interface PendingAlert {
  tableId: string;
  tableNumber: string;
  type: ServiceRequestType;
}

/** Aviso emergente centrado cuando cualquier mesa llama al mesero o pide la cuenta
 * (hoy esos eventos solo prenden un ícono pasivo en "Órdenes de Mesa" — este componente
 * los hace imposibles de ignorar). Le aparece a TODOS los meseros conectados, sin importar
 * si la mesa tiene un mesero asignado, porque el llamado es urgente y cualquiera puede
 * atenderlo; en cuanto uno lo atiende, el evento table:service-ack cierra el aviso a los demás.
 * Reutiliza el mismo evento/endpoint que ya existe. */
export function TableServiceAlert() {
  const [alert, setAlert] = useState<PendingAlert | null>(null);
  const tablesRef = useRef<TableItem[]>([]);

  useEffect(() => {
    api.get('/tables').then((res) => {
      tablesRef.current = res.data.data;
    });

    const socket: Socket = io('/', { auth: { token: getToken() } });

    socket.on('table:service-request', (payload: { tableId: string; type: ServiceRequestType }) => {
      const table = tablesRef.current.find((t) => t.id === payload.tableId);
      setAlert({ tableId: payload.tableId, tableNumber: table?.number ?? '', type: payload.type });
      new Audio('/sounds/notification.mp3').play().catch(() => {});
    });

    socket.on('table:service-ack', (payload: { tableId: string }) => {
      setAlert((a) => (a && a.tableId === payload.tableId ? null : a));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function attend() {
    if (!alert) return;
    const tableId = alert.tableId;
    setAlert(null);
    try {
      await api.patch(`/tables/${tableId}/service-request/ack`);
    } catch {
      // Si falla, la mesa sigue mostrando su ícono pasivo en Mesas para reintentar desde ahí.
    }
  }

  if (!alert) return null;
  const isCall = alert.type === 'WAITER_CALL';

  return (
    <Dialog open onOpenChange={(open) => !open && setAlert(null)}>
      <DialogContent className="max-w-xs text-center">
        <div
          className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
            isCall ? 'bg-accent text-accent-foreground' : 'bg-[#e3f5ec] text-[#0f6e46]'
          }`}
        >
          {isCall ? <BellRing className="h-6 w-6" /> : <Receipt className="h-6 w-6" />}
        </div>
        <h3 className="text-base font-semibold text-brand-950">
          Mesa {alert.tableNumber} {isCall ? 'te está llamando' : 'pidió la cuenta'}
        </h3>
        <p className="mt-1 text-xs text-brand-950/50 font-light">
          {isCall ? 'Solicitó atención en la mesa' : 'Solicitó cerrar la mesa'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <TextureButton variant="brand" size="default" className="!w-full" onClick={attend}>
            Atender
          </TextureButton>
          <button
            type="button"
            className="text-xs font-medium text-brand-950/40 py-1"
            onClick={() => setAlert(null)}
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
