import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { BellRing, LogOut, Receipt, RefreshCw } from 'lucide-react';
import { api, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { FloorPlan, FloorPlanTable, OrderView } from '../../types';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Pantalla (rol SCREEN): pensada para un monitor/TV fijo en el local, sin
 * interacción — Cocina a la izquierda, Mesas a la derecha, en horizontal.
 * Único punto interactivo: el aviso de llamado/cuenta, para que el mesero
 * pueda atenderlo con un toque directo desde este mismo monitor.
 */
export default function ScreenPage() {
  const { logout } = useAuth();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [plan, setPlan] = useState<FloorPlan | null>(null);

  function load() {
    api.get('/orders/kitchen').then((res) => setOrders(res.data.data));
    api.get('/tables/floor-plan').then((res) => setPlan(res.data.data));
  }

  useEffect(() => {
    load();
    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);
    socket.on('table:service-request', load);
    socket.on('table:service-ack', load);
    return () => {
      socket.disconnect();
    };
  }, []);

  async function acknowledgeServiceRequest(t: FloorPlanTable) {
    try {
      await api.patch(`/tables/${t.id}/service-request/ack`);
      load();
    } catch {
      // Si falla, el aviso simplemente sigue visible y se puede reintentar.
    }
  }

  const sections = plan
    ? [...plan.zones, ...(plan.unzoned.length > 0 ? [{ id: 'unzoned', name: 'Sin zona', tables: plan.unzoned }] : [])]
    : [];

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#fafafa]">
      <div className="fixed top-3 right-3 z-20 flex items-center gap-2">
        <TextureButton
          variant="icon"
          size="icon"
          aria-label="Refrescar"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4 text-brand-950/70" />
        </TextureButton>
        <TextureButton variant="icon" size="icon" aria-label="Cerrar sesión" onClick={logout}>
          <LogOut className="h-4 w-4 text-brand-950/70" />
        </TextureButton>
      </div>

      <div className="w-1/2 h-full overflow-y-auto p-8 border-r border-brand-950/10">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-950 mb-6">Cocina</h1>
        <div className="grid grid-cols-2 gap-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white shadow-sm p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-brand-950 truncate">
                  #{o.orderNumber}
                  {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                </p>
                <span className="text-xs bg-brand-950/[0.06] px-2 py-0.5 rounded-full shrink-0">
                  {o.channel === 'DINE_IN' ? `Mesa ${o.table?.number ?? ''}` : o.channel}
                </span>
              </div>
              <ul className="text-sm space-y-1 font-light mt-2">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="col-span-2 text-brand-950/40 font-light text-center py-16">Sin comandas pendientes.</p>
          )}
        </div>
      </div>

      <div className="w-1/2 h-full overflow-y-auto p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-950 mb-6">Mesas</h1>
        <div className="space-y-8">
          {sections.map((zone) => (
            <div key={zone.id}>
              <h2 className="text-sm font-semibold text-brand-950/70 mb-3">{zone.name}</h2>
              <div className="grid grid-cols-6 gap-3">
                {zone.tables.map((t) => (
                  <div key={t.id} className="relative">
                    <div
                      className={`aspect-square rounded-xl flex items-center justify-center font-semibold text-sm ${
                        t.session ? 'bg-emerald-500 text-white shadow-sm' : 'bg-brand-950/[0.06] text-brand-950/50'
                      }`}
                    >
                      {t.number}
                    </div>
                    {t.serviceRequest && (
                      <button
                        onClick={() => acknowledgeServiceRequest(t)}
                        aria-label={
                          t.serviceRequest === 'WAITER_CALL' ? 'Atender llamado al mesonero' : 'Marcar cuenta entregada'
                        }
                        title={t.serviceRequest === 'WAITER_CALL' ? 'Llamando al mesonero' : 'Pidió la cuenta'}
                        className={`absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full flex items-center justify-center shadow ring-2 ring-white animate-pulse ${
                          t.serviceRequest === 'WAITER_CALL'
                            ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
                            : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
                        }`}
                      >
                        {t.serviceRequest === 'WAITER_CALL' ? (
                          <BellRing className="h-3.5 w-3.5" />
                        ) : (
                          <Receipt className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-brand-950/40 font-light text-center py-16">Sin mesas creadas.</p>
          )}
        </div>
      </div>
    </div>
  );
}
