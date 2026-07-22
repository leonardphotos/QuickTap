import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { BellRing, CreditCard, Lock, LogOut, MoveHorizontal, Plus, Printer, Receipt } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { FloorPlan, FloorPlanTable, Product } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { ManualOrderDialog } from '@/components/admin/ManualOrderDialog';

const STATUS_LABEL: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
};

interface Props {
  /** Solo en el dashboard del Mesero: botón "Pagar" de un pedido cambia a la pestaña Comandas
   * y abre ahí el diálogo de pago (completo/fraccionado/deuda) para ese pedido. */
  onPayOrder?: (orderId: string) => void;
}

export default function TableOrdersPage({ onPayOrder }: Props = {}) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<FloorPlanTable | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closePaymentMethod, setClosePaymentMethod] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);

  function load() {
    api.get('/tables/floor-plan').then((res) => setPlan(res.data.data));
  }

  useEffect(() => {
    load();
    api.get('/products').then((res) => setProducts(res.data.data));

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

  useEffect(() => {
    setClosing(false);
    setClosePaymentMethod('');
  }, [selected?.id]);

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
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${selected.session.id}/close`, {
        paymentMethod: closePaymentMethod || undefined,
      });
      setSelected(null);
      setClosing(false);
      setClosePaymentMethod('');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cerrar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  /** No imprime desde este navegador — reenvía la comanda a la estación de impresión. */
  async function printOrder(orderId: string) {
    setPrintingId(orderId);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/print-comanda`);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda a la estación de impresión.');
    } finally {
      setPrintingId(null);
    }
  }

  async function acceptOrder(orderId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/accept`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo aceptar el pedido.');
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

  async function resetPin() {
    if (!selected?.session) return;
    if (!confirm('¿Quitar la clave de esta mesa? Cualquiera podrá pedir sin necesidad de clave hasta que se defina una nueva.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${selected.session.id}/reset-pin`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo quitar la clave.');
    } finally {
      setBusy(false);
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
        {sections.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 -mt-2 text-xs text-brand-950/50 font-light">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0f6e46]" /> Libre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-950" /> Ocupada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#8a5106]" /> Piden cuenta
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#9d2469]" /> Reservada
            </span>
          </div>
        )}
        {sections.map((zone) => (
          <div key={zone.id}>
            <h2 className="text-sm font-semibold text-brand-950/70 mb-4">{zone.name}</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {zone.tables.map((t) => (
                <div key={t.id} className="relative">
                  <button
                    onClick={() => setSelected(t)}
                    className={`aspect-square w-full rounded-2xl flex flex-col items-center justify-center gap-0.5 font-semibold text-sm transition-all duration-200 hover:scale-[1.04] ${
                      t.serviceRequest
                        ? 'bg-[#fbedd6] text-[#8a5106]'
                        : t.session
                          ? 'bg-secondary text-brand-950'
                          : t.reserved
                            ? 'bg-[#fbe7f1] text-[#9d2469]'
                            : 'bg-[#e3f5ec] text-[#0f6e46]'
                    }`}
                  >
                    <span>{t.number}</span>
                    <span className="text-[9px] font-medium opacity-80">
                      {t.serviceRequest ? 'Cuenta' : t.session ? 'Ocupada' : t.reserved ? 'Reservada' : 'Libre'}
                    </span>
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
                {selected.session.pinRequired && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-500">
                    <Lock className="h-3 w-3" /> Con clave
                  </span>
                )}
              </p>

              <ul className="space-y-3 max-h-72 overflow-y-auto">
                {selected.session.orders.map((o) => (
                  <li key={o.orderId} className="border-b border-brand-950/10 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-brand-950">
                        Pedido #{o.pedidoNumber}{' '}
                        <span
                          className={`font-normal ${o.status === 'NEEDS_CONFIRMATION' ? 'text-amber-600' : 'text-brand-950/40'}`}
                        >
                          · {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </p>
                      {o.status === 'NEEDS_CONFIRMATION' && (
                        <button
                          onClick={() => acceptOrder(o.orderId)}
                          disabled={busy}
                          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50"
                        >
                          Aceptar pedido
                        </button>
                      )}
                    </div>
                    <ul className="text-sm space-y-1 font-light mt-1">
                      {o.items.map((it, i) => (
                        <li key={i}>
                          <span className="font-medium">{it.quantity}x</span> {it.name}
                          {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                          {it.modifiers.length > 0 && (
                            <span className="text-brand-950/50"> ({it.modifiers.join(', ')})</span>
                          )}
                          {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => printOrder(o.orderId)}
                        disabled={printingId === o.orderId}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 disabled:opacity-50"
                      >
                        <Printer className="h-3.5 w-3.5" /> {printingId === o.orderId ? 'Enviando…' : 'Imprimir comanda'}
                      </button>
                      {onPayOrder && (
                        <button
                          onClick={() => {
                            onPayOrder(o.orderId);
                            setSelected(null);
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-brand-500 text-white hover:bg-brand-400"
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Pagar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <TextureButton
                  variant="brand"
                  size="default"
                  onClick={() => setManualOrderOpen(true)}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Generar orden
                </TextureButton>
                <TextureButton
                  variant="minimal"
                  size="default"
                  onClick={() => setMoveOpen(true)}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <MoveHorizontal className="h-4 w-4" /> Rodar mesa
                </TextureButton>
                {selected.session.pinRequired && (
                  <TextureButton
                    variant="minimal"
                    size="default"
                    onClick={resetPin}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" /> Quitar clave
                  </TextureButton>
                )}
                {!closing && (
                  <TextureButton
                    variant="destructive"
                    size="default"
                    onClick={() => setClosing(true)}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" /> Cerrar mesa
                  </TextureButton>
                )}
              </div>

              {closing && (
                <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-2.5">
                  <p className="text-sm text-brand-950">¿Cómo pagó la mesa? (opcional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: '', label: 'Sin indicar' },
                      { value: 'CASH', label: 'Efectivo' },
                      { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
                      { value: 'CARD', label: 'Tarjeta' },
                      { value: 'ZELLE', label: 'Zelle' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setClosePaymentMethod(opt.value)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          closePaymentMethod === opt.value
                            ? 'bg-brand-500 text-white'
                            : 'bg-white text-brand-950/60 border border-brand-950/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <TextureButton
                      variant="destructive"
                      size="sm"
                      onClick={closeTable}
                      disabled={busy}
                      className="!w-auto disabled:opacity-50"
                    >
                      {busy ? 'Cerrando…' : 'Confirmar cierre'}
                    </TextureButton>
                    <TextureButton
                      variant="minimal"
                      size="sm"
                      onClick={() => {
                        setClosing(false);
                        setClosePaymentMethod('');
                      }}
                      className="!w-auto"
                    >
                      Cancelar
                    </TextureButton>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-brand-950/40 font-light">Esta mesa está libre.</p>
              <TextureButton
                variant="brand"
                size="default"
                onClick={() => setManualOrderOpen(true)}
                className="flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Generar orden
              </TextureButton>
            </div>
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

      {manualOrderOpen && selected && (
        <ManualOrderDialog
          tableId={selected.id}
          tableNumber={selected.number}
          hasOpenSession={!!selected.session}
          products={products}
          onClose={() => setManualOrderOpen(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
