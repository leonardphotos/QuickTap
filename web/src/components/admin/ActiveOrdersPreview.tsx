import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { Clock, CreditCard, MessageCircle, Printer, Receipt, SplitSquareHorizontal, Trash2 } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { abbreviateTableBadge } from '@/utils/format';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/ui/toast';
import { EditOrderDialog, getPaymentStatus, handleWhatsappSendResult, type LiveOrder } from './LiveOrdersPanel';
import { PaymentDialog } from './PaymentDialog';

const CHANNEL_LABEL: Record<LiveOrder['channel'], string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Para llevar',
  BAR: 'Barra',
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  NEEDS_CONFIRMATION: { label: 'Nueva', bg: '#fbedd6', fg: '#8a5106' },
  PENDING: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  KITCHEN: { label: 'En cocina', bg: '#e6f2fe', fg: 'var(--color-brand-900)' },
  SERVED: { label: 'Servido', bg: '#e3f5ec', fg: '#0f6e46' },
};

function timeAgo(iso: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return secs < 60 ? `hace ${secs}s` : `hace ${Math.floor(secs / 60)} min`;
}

/** Envuelve una tarjeta pagada: deslizar hacia la izquierda la quita de la lista (solo visual,
 * no borra el pedido — vuelve a aparecer si se recarga la página, ya que sigue "activo"). */
function DismissibleRow({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  function onPointerDown(e: PointerEvent) {
    draggingRef.current = true;
    startXRef.current = e.clientX;
  }
  function onPointerMove(e: PointerEvent) {
    if (!draggingRef.current) return;
    setDragX(Math.min(0, e.clientX - startXRef.current));
  }
  function endDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX < -90) {
      setDragX(-400);
      setTimeout(onDismiss, 180);
    } else {
      setDragX(0);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 bg-red-500 flex items-center justify-end pr-4 rounded-2xl">
        <Trash2 className="h-4 w-4 text-white" />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: draggingRef.current ? 'none' : 'transform 180ms ease-out',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Vista rápida de pedidos activos del mesero, debajo del mapa de mesas — tocar una fila
 * abre el pedido completo (mismo editor que usa la pestaña Comandas). */
export function ActiveOrdersPreview() {
  const { user, restaurant } = useAuth();
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const { show, toastMessage } = useToast();
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ order: LiveOrder; mode: 'full' | 'split' } | null>(null);
  const [comandaMenuFor, setComandaMenuFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);
  // Deslizar una comanda ya pagada la quita de esta vista (solo local: no borra el pedido).
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  function load() {
    api.get('/orders/live').then((res) => setOrders(res.data.data));
  }

  useEffect(() => {
    load();
    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);
    return () => {
      socket.disconnect();
    };
  }, []);

  // Mientras el diálogo de pago está abierto, lo refresca con los datos frescos que lleguen.
  useEffect(() => {
    if (!paymentDialog || !orders) return;
    const fresh = orders.find((o) => o.id === paymentDialog.order.id);
    if (fresh) setPaymentDialog((d) => (d ? { ...d, order: fresh } : d));
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleAwaitingPayment(id: string, awaitingPayment: boolean) {
    setBusyId(id);
    try {
      await api.patch(`/orders/${id}/awaiting-payment`, { awaitingPayment });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function printComanda(orderId: string) {
    setPrintingId(orderId);
    try {
      const o = orders?.find((x) => x.id === orderId);
      if (o && (o.status === 'PENDING' || o.status === 'NEEDS_CONFIRMATION')) {
        // Si ya se aceptó justo antes (doble click), el 400 de "ya no está pendiente" no debe frenar la impresión.
        await api.post(`/orders/${orderId}/accept`).catch(() => {});
      }
      await api.post(`/orders/${orderId}/print-comanda`);
    } finally {
      setPrintingId(null);
      setComandaMenuFor(null);
    }
  }

  async function sendWhatsapp(order: LiveOrder) {
    const win = window.open('', '_blank');
    setSendingWhatsappId(order.id);
    try {
      const { data } = await api.post(`/orders/${order.id}/send-whatsapp`);
      handleWhatsappSendResult(win, data.data, () => show('Mensaje enviado'));
    } catch {
      win?.close();
    } finally {
      setSendingWhatsappId(null);
      setComandaMenuFor(null);
    }
  }

  // Mismo criterio de "me corresponde" que usa LiveOrdersPanel para el rol Mesero.
  const mine = (orders ?? []).filter((o) => {
    if (o.placedByUser?.id === user?.id) return true;
    if (o.acceptedByUserId === user?.id) return true;
    if (o.table?.assignedWaiterId) return o.table.assignedWaiterId === user?.id;
    return !o.placedByUser && !o.acceptedByUserId;
  });
  const visible = mine.filter((o) => !dismissedIds.has(o.id));

  if (!orders || visible.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-brand-950">Comandas activas</h2>
        <p className="text-xs text-brand-950/50">{visible.length}</p>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((o) => {
          const meta = STATUS_META[o.status] ?? { label: o.status, bg: '#eef3fc', fg: 'var(--color-brand-950)' };
          const itemsSummary = o.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ');
          const { fullyPaid } = getPaymentStatus(o);
          const card = (
            <div className="bg-white border border-brand-950/10 rounded-2xl px-3.5 py-3 shadow-sm">
              <div
                onClick={() => setEditingOrder(o)}
                className="flex items-center gap-3 text-left cursor-pointer"
              >
                <div
                  className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center font-semibold text-[13px] shrink-0"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  {o.channel === 'DINE_IN' && o.table ? abbreviateTableBadge(o.table.number) : '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-brand-950">
                    {CHANNEL_LABEL[o.channel]}
                    <span
                      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-brand-950/50 truncate mt-0.5">
                    {itemsSummary || 'Sin productos'} · {timeAgo(o.createdAt)}
                  </p>
                </div>
              </div>

              {fullyPaid ? (
                <p className="text-xs text-emerald-600 font-medium text-center mt-2">✓ Pagado</p>
              ) : (
                <div className={`grid ${canAccountsPayable ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 mt-2`}>
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'full' })}
                    title="Pagar"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-[11px] font-medium py-2 transition-colors"
                  >
                    <CreditCard className="h-4 w-4" /> Pagar
                  </button>
                  <button
                    onClick={() => setPaymentDialog({ order: o, mode: 'split' })}
                    title="Pago fraccionado"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-[11px] font-medium py-2 transition-colors"
                  >
                    <SplitSquareHorizontal className="h-4 w-4" /> Fraccionado
                  </button>
                  {canAccountsPayable && (
                    <button
                      onClick={() => toggleAwaitingPayment(o.id, !o.awaitingPayment)}
                      disabled={busyId === o.id}
                      title={o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl text-white text-[11px] font-medium py-2 transition-colors disabled:opacity-40 ${
                        o.awaitingPayment ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                    >
                      <Clock className="h-4 w-4" /> {o.awaitingPayment ? 'Pendiente' : 'Cta. abierta'}
                    </button>
                  )}
                  <button
                    onClick={() => setComandaMenuFor(comandaMenuFor === o.id ? null : o.id)}
                    title="Comanda"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-950/15 text-brand-950/70 hover:bg-brand-950/[0.03] text-[11px] font-medium py-2 transition-colors"
                  >
                    <Receipt className="h-4 w-4" /> Comanda
                  </button>
                </div>
              )}

              {comandaMenuFor === o.id && (
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <button
                    onClick={() => printComanda(o.id)}
                    disabled={printingId === o.id}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                  >
                    <Printer className="h-3.5 w-3.5" /> {printingId === o.id ? 'Enviando…' : 'Imprimir'}
                  </button>
                  <button
                    onClick={() => sendWhatsapp(o)}
                    disabled={sendingWhatsappId === o.id || !o.customerPhone}
                    title={o.customerPhone ? undefined : 'Este pedido no tiene teléfono registrado.'}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 text-xs font-medium py-2 transition-colors disabled:opacity-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsappId === o.id ? 'Enviando…' : 'WhatsApp'}
                  </button>
                </div>
              )}
            </div>
          );
          return (
            <div key={o.id}>
              {fullyPaid ? (
                <DismissibleRow onDismiss={() => setDismissedIds((prev) => new Set(prev).add(o.id))}>
                  {card}
                </DismissibleRow>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>

      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onSaved={load} />
      )}

      {paymentDialog && (
        <PaymentDialog
          order={paymentDialog.order}
          mode={paymentDialog.mode}
          onClose={() => setPaymentDialog(null)}
          onPaid={load}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
}
