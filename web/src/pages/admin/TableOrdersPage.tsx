import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { BellRing, Check, Lock, LogOut, MoveHorizontal, Plus, Printer, Receipt } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { FloorPlan, FloorPlanTable, Product } from '../../types';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { ManualOrderDialog } from '@/components/admin/ManualOrderDialog';
import { EditOrderDialog, getPaymentStatus, type LiveOrder } from '@/components/admin/LiveOrdersPanel';
import { PaymentDialog } from '@/components/admin/PaymentDialog';

const STATUS_LABEL: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
};

export default function TableOrdersPage() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<FloorPlanTable | null>(null);
  // Mesa con varias cuentas abiertas: cuál de ellas está activa en el diálogo/footer. Null = mesa
  // libre o con una sola cuenta (en ese caso `activeSession` cae directo a `sessions[0]`).
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [liveOrders, setLiveOrders] = useState<LiveOrder[] | null>(null);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [payBeforeClosing, setPayBeforeClosing] = useState<LiveOrder | null>(null);

  function load() {
    api.get('/tables/floor-plan').then((res) => setPlan(res.data.data));
  }

  /** Pedidos completos (con ítems editables, precios, etc.) para poder abrir "Editar pedido"
   * al tocar un pedido de la mesa — `plan.session.orders` solo trae un resumen de solo lectura. */
  function loadOrders() {
    api.get('/orders/live').then((res) => setLiveOrders(res.data.data));
  }

  useEffect(() => {
    load();
    loadOrders();
    api.get('/products').then((res) => setProducts(res.data.data));

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);
    socket.on('table:service-request', load);
    socket.on('table:service-ack', load);
    socket.on('order:new', loadOrders);
    socket.on('order:updated', loadOrders);

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

  // Mientras "Editar pedido" está abierto desde una mesa, lo refresca con los datos frescos que lleguen.
  useEffect(() => {
    if (!editingOrder || !liveOrders) return;
    const fresh = liveOrders.find((lo) => lo.id === editingOrder.id);
    if (fresh) setEditingOrder(fresh);
  }, [liveOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Igual, mientras el "Pagar antes de cerrar" está abierto (para reflejar el saldo tras cada abono).
  useEffect(() => {
    if (!payBeforeClosing || !liveOrders) return;
    const fresh = liveOrders.find((lo) => lo.id === payBeforeClosing.id);
    if (fresh) setPayBeforeClosing(fresh);
  }, [liveOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const freeTables = useMemo(
    () => sections.flatMap((s) => s.tables).filter((t) => t.sessions.length === 0 && t.id !== selected?.id),
    [sections, selected],
  );

  // Con una sola cuenta (el caso de siempre), cae directo a ella sin que el mesero tenga que elegir nada.
  const activeSession = selected ? selected.sessions.find((s) => s.id === selectedSessionId) ?? selected.sessions[0] ?? null : null;

  async function closeTable() {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/close`);
      setSelected(null);
      setEditingOrder(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cerrar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  /** "Cerrar mesa": si algún pedido de la cuenta activa todavía no está pagado, abre "Pagar" para
   * ese pedido en vez de cerrar — no debe poder cerrarse una cuenta dejando saldo sin cobrar.
   * Si todo ya está pagado, cierra directo sin preguntar cómo se pagó. */
  function handleCerrarMesaClick() {
    if (!activeSession) return;
    const unpaid = activeSession.orders
      .map((o) => liveOrders?.find((lo) => lo.id === o.orderId))
      .filter((full): full is LiveOrder => !!full && !getPaymentStatus(full).fullyPaid);
    if (unpaid.length === 0) {
      closeTable();
      return;
    }
    const current = editingOrder && unpaid.find((o) => o.id === editingOrder.id);
    setPayBeforeClosing(current ?? unpaid[0]);
  }

  /** No imprime desde este navegador — reenvía la comanda a la estación de impresión. */
  async function printOrder(orderId: string, status: string) {
    setPrintingId(orderId);
    setError(null);
    try {
      if (status === 'PENDING' || status === 'NEEDS_CONFIRMATION') {
        // Si ya se aceptó justo antes (doble click), el 400 de "ya no está pendiente" no debe frenar la impresión.
        await api.post(`/orders/${orderId}/accept`).catch(() => {});
      }
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
      loadOrders();
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
    if (!activeSession) return;
    if (!confirm('¿Quitar la clave de esta cuenta? Cualquiera podrá pedir sin necesidad de clave hasta que se defina una nueva.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/reset-pin`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo quitar la clave.');
    } finally {
      setBusy(false);
    }
  }

  async function moveTable(newTableId: string) {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/move`, { tableId: newTableId });
      setMoveOpen(false);
      setSelected(null);
      setEditingOrder(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo rodar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  /** Al tocar una mesa con cuenta(s) abierta(s), muestra la más reciente por defecto y abre
   * directo "Editar pedido" del pedido más reciente de esa cuenta, sin pasar por una lista intermedia. */
  function openTable(t: FloorPlanTable) {
    setSelected(t);
    if (t.sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    const mostRecentSession = t.sessions[t.sessions.length - 1];
    setSelectedSessionId(mostRecentSession.id);
    if (mostRecentSession.orders.length === 0) return;
    const mostRecent = [...mostRecentSession.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const full = liveOrders?.find((lo) => lo.id === mostRecent.orderId);
    if (full) setEditingOrder(full);
  }

  /** Cambia de cuenta dentro de la misma mesa: recarga el pedido más reciente de la cuenta elegida. */
  function selectAccount(session: NonNullable<typeof activeSession>) {
    setSelectedSessionId(session.id);
    if (session.orders.length === 0) {
      setEditingOrder(null);
      return;
    }
    const mostRecent = [...session.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const full = liveOrders?.find((lo) => lo.id === mostRecent.orderId);
    if (full) setEditingOrder(full);
  }

  function selectOrderTab(orderId: string) {
    const full = liveOrders?.find((lo) => lo.id === orderId);
    if (full) setEditingOrder(full);
  }

  /** Generar orden / Rodar mesa / Quitar clave / Cerrar mesa — se muestran tanto en el diálogo
   * de mesa (mesa libre / respaldo sin pedido cargado aún) como fijos arriba de "Editar pedido". */
  function renderMesaActions() {
    if (!activeSession) return null;
    return (
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
        {activeSession.pinRequired && (
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
        <TextureButton
          variant="destructive"
          size="default"
          onClick={handleCerrarMesaClick}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" /> Cerrar mesa
        </TextureButton>
      </div>
    );
  }

  /** Chips para elegir cuenta cuando la mesa tiene más de una abierta a la vez. */
  function renderAccountSwitcher() {
    if (!selected || selected.sessions.length < 2) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {selected.sessions.map((s, i) => (
          <button
            key={s.id}
            onClick={() => selectAccount(s)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              activeSession?.id === s.id ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
            }`}
          >
            {s.label ?? `Cuenta ${i + 1}`} · {formatBase(s.totalBase, symbol)}
          </button>
        ))}
      </div>
    );
  }

  const activeSessionOrders = activeSession?.orders ?? [];
  const mesaFooter =
    activeSession && editingOrder && editingOrder.channel === 'DINE_IN' ? (
      <>
        <p className="text-sm font-semibold text-brand-950 flex items-center gap-2">
          Mesa {selected?.number}
          {activeSession.pinRequired && (
            <span className="inline-flex items-center gap-1 text-xs text-brand-500 font-normal">
              <Lock className="h-3 w-3" /> Con clave
            </span>
          )}
        </p>
        {renderAccountSwitcher()}
        {activeSessionOrders.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {activeSessionOrders.map((o) => (
              <button
                key={o.orderId}
                onClick={() => selectOrderTab(o.orderId)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  editingOrder.id === o.orderId ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
                }`}
              >
                Pedido #{o.pedidoNumber}
              </button>
            ))}
          </div>
        )}
        {editingOrder.status === 'NEEDS_CONFIRMATION' && (
          <button
            onClick={() => acceptOrder(editingOrder.id)}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50 w-fit"
          >
            <Check className="h-3.5 w-3.5" /> Aceptar pedido
          </button>
        )}
        {renderMesaActions()}
      </>
    ) : null;

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
                    onClick={() => openTable(t)}
                    className={`aspect-square w-full rounded-2xl flex flex-col items-center justify-center gap-0.5 font-semibold text-sm transition-all duration-200 hover:scale-[1.04] ${
                      t.serviceRequest
                        ? 'bg-[#fbedd6] text-[#8a5106]'
                        : t.sessions.length > 0
                          ? 'bg-secondary text-brand-950'
                          : t.reserved
                            ? 'bg-[#fbe7f1] text-[#9d2469]'
                            : 'bg-[#e3f5ec] text-[#0f6e46]'
                    }`}
                  >
                    <span>{t.number}</span>
                    <span className="text-[9px] font-medium opacity-80">
                      {t.serviceRequest
                        ? 'Cuenta'
                        : t.sessions.length > 1
                          ? `${t.sessions.length} cuentas`
                          : t.sessions.length === 1
                            ? 'Ocupada'
                            : t.reserved
                              ? 'Reservada'
                              : 'Libre'}
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

      <Dialog open={!!selected && !editingOrder} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesa {selected?.number}</DialogTitle>
          </DialogHeader>
          {activeSession ? (
            <div className="space-y-4">
              {renderAccountSwitcher()}
              <p className="text-sm text-brand-950/70">
                <span className="font-medium text-brand-950">{activeSession.customerName}</span>
                {' · Cédula '}
                {activeSession.customerIdNumber}
                {activeSession.pinRequired && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-500">
                    <Lock className="h-3 w-3" /> Con clave
                  </span>
                )}
              </p>

              <ul className="space-y-3 max-h-72 overflow-y-auto">
                {activeSession.orders.map((o) => (
                  <li
                    key={o.orderId}
                    className="border-b border-brand-950/10 pb-2 cursor-pointer -mx-1 px-1 rounded-lg hover:bg-brand-950/[0.03] transition-colors"
                    onClick={() => {
                      const full = liveOrders?.find((lo) => lo.id === o.orderId);
                      if (full) setEditingOrder(full);
                    }}
                  >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptOrder(o.orderId);
                          }}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          printOrder(o.orderId, o.status);
                        }}
                        disabled={printingId === o.orderId}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 disabled:opacity-50"
                      >
                        <Printer className="h-3.5 w-3.5" /> {printingId === o.orderId ? 'Enviando…' : 'Imprimir comanda'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {renderMesaActions()}
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
          sessions={selected.sessions}
          products={products}
          onClose={() => setManualOrderOpen(false)}
          onCreated={load}
        />
      )}

      {editingOrder && (
        <EditOrderDialog
          order={editingOrder}
          onClose={() => {
            setEditingOrder(null);
            setSelected(null);
          }}
          onSaved={() => {
            load();
            loadOrders();
          }}
          mesaFooter={mesaFooter}
        />
      )}

      {payBeforeClosing && (
        <PaymentDialog
          order={payBeforeClosing}
          mode="full"
          onClose={() => setPayBeforeClosing(null)}
          onPaid={() => {
            load();
            loadOrders();
          }}
        />
      )}
    </div>
  );
}
