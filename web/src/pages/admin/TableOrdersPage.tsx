import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { BellRing, LogOut, MoveHorizontal, Receipt } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { FloorPlan, FloorPlanTable } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
};

export default function TableOrdersPage() {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<FloorPlanTable | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
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

  const sections = useMemo(() => {
    if (!plan) return [];
    return [...plan.zones, ...(plan.unzoned.length > 0 ? [{ id: 'unzoned', name: 'Sin zona', tables: plan.unzoned }] : [])];
  }, [plan]);

  // Refresca la mesa seleccionada con los datos frescos cada vez que llega el plan.
  useEffect(() => {
    if (!selected || !plan) return;
    const fresh = sections.flatMap((s) => s.tables).find((t) => t.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const freeTables = useMemo(
    () => sections.flatMap((s) => s.tables).filter((t) => !t.session && t.id !== selected?.id),
    [sections, selected],
  );

  async function closeTable() {
    if (!selected?.session) return;
    if (!confirm(`¿Cerrar la cuenta de la mesa ${selected.number}? Se podrán recibir nuevos pedidos allí.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${selected.session.id}/close`);
      setSelected(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cerrar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeServiceRequest(t: FloorPlanTable) {
    try {
      await api.patch(`/tables/${t.id}/service-request/ack`);
      load();
    } catch {
      // Si falla, el aviso simplemente sigue visible y se puede reintentar.
    }
  }

  async function moveTable(newTableId: string) {
    if (!selected?.session) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${selected.session.id}/move`, { tableId: newTableId });
      setMoveOpen(false);
      setSelected(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo rodar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return <p className="text-brand-950/50 font-light">Cargando plano de mesas…</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Órdenes de Mesa</h1>

      {sections.length === 0 && (
        <p className="text-sm text-brand-950/40 py-10 text-center font-light">
          Todavía no hay mesas creadas. Ve a Mesas / QR para crearlas.
        </p>
      )}

      <div className="rounded-3xl border border-brand-950/10 bg-white p-8 space-y-10 shadow-sm">
        {sections.map((zone) => (
          <div key={zone.id}>
            <h2 className="text-sm font-semibold text-brand-950/70 mb-4">{zone.name}</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {zone.tables.map((t) => (
                <div key={t.id} className="relative">
                  <button
                    onClick={() => setSelected(t)}
                    className={`aspect-square w-full rounded-2xl flex items-center justify-center font-semibold text-sm transition-all duration-200 hover:scale-[1.04] ${
                      t.session
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                        : 'bg-brand-950/[0.06] text-brand-950/50 hover:bg-brand-950/10'
                    }`}
                  >
                    {t.number}
                  </button>
                  {t.serviceRequest && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeServiceRequest(t);
                      }}
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
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesa {selected?.number}</DialogTitle>
          </DialogHeader>
          {selected?.session ? (
            <div className="space-y-4">
              <p className="text-sm text-brand-950/70">
                <span className="font-medium text-brand-950">{selected.session.customerName}</span>
                {' · Cédula '}
                {selected.session.customerIdNumber}
              </p>

              <ul className="space-y-3 max-h-72 overflow-y-auto">
                {selected.session.orders.map((o) => (
                  <li key={o.orderId} className="border-b border-brand-950/10 pb-2">
                    <p className="text-sm font-semibold text-brand-950">
                      Pedido #{o.pedidoNumber}{' '}
                      <span className="font-normal text-brand-950/40">· {STATUS_LABEL[o.status] ?? o.status}</span>
                    </p>
                    <ul className="text-sm space-y-1 font-light mt-1">
                      {o.items.map((it, i) => (
                        <li key={i}>
                          <span className="font-medium">{it.quantity}x</span> {it.name}
                          {it.modifiers.length > 0 && (
                            <span className="text-brand-950/50"> ({it.modifiers.join(', ')})</span>
                          )}
                          {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2">
                <TextureButton
                  variant="minimal"
                  size="default"
                  onClick={() => setMoveOpen(true)}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <MoveHorizontal className="h-4 w-4" /> Rodar mesa
                </TextureButton>
                <TextureButton
                  variant="destructive"
                  size="default"
                  onClick={closeTable}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" /> Cerrar mesa
                </TextureButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-950/40 font-light">Esta mesa está libre.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rodar mesa {selected?.number} a…</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
            {freeTables.map((t) => (
              <button
                key={t.id}
                onClick={() => moveTable(t.id)}
                disabled={busy}
                className="aspect-square rounded-xl bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center font-medium text-sm text-brand-950 disabled:opacity-50"
              >
                {t.number}
              </button>
            ))}
            {freeTables.length === 0 && (
              <p className="col-span-4 text-sm text-brand-950/40 font-light text-center py-4">
                No hay otras mesas libres.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
