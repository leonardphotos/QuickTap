import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from './clubStyle';

interface Payable {
  id: string;
  description: string;
  amountBase: string;
  category: string | null;
  expenseDate: string | null;
  createdAt: string;
  referenceNumber: string | null;
  supplier: { id: string; name: string } | null;
}

interface PaymentOrder {
  id: string;
  orderNumber: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  amountBase: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  supplier: { id: string; name: string; taxId: string | null } | null;
  createdByUser: { name: string } | null;
  paidByUser: { name: string } | null;
  movements: { id: string; description: string; amountBase: string; creditPaidAt: string | null }[];
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo Bs' },
  { value: 'CASH_USD', label: 'Efectivo $' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'BINANCE', label: 'Binance' },
  { value: 'CARD', label: 'Punto de Venta' },
  { value: 'PAYPAL', label: 'PayPal' },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/**
 * Cuentas por pagar a proveedores y sus órdenes de pago.
 *
 * Una cuenta por pagar es un gasto que se tomó a crédito y todavía no se saldó. La orden de
 * pago agrupa varias en un documento con número, para autorizarlas y pagarlas de una vez —
 * marcarlas una por una no deja rastro de que se pagaron todas con la misma transferencia.
 */
export default function ClubPayablesPage({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PaymentOrder | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    Promise.all([api.get('/payment-orders/payables'), api.get('/payment-orders')])
      .then(([p, o]) => {
        setPayables(p.data.data.movements);
        setOrders(o.data.data);
      })
      .catch(() => setError('No pudimos cargar las cuentas por pagar.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Una orden es de un solo proveedor (lo valida el servidor): al marcar el primero se acota
  // la selección, para no dejar armar algo que se va a rechazar al confirmar.
  const lockedSupplier = (() => {
    const first = payables.find((p) => selected.has(p.id));
    return first?.supplier?.id ?? null;
  })();

  function toggle(p: Payable) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

  const selectedTotal = payables
    .filter((p) => selected.has(p.id))
    .reduce((acc, p) => acc + Number(p.amountBase), 0);

  async function createOrder() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/payment-orders', { movementIds: [...selected] });
      setSelected(new Set());
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo emitir la orden.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(order: PaymentOrder) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/payment-orders/${order.id}/cancel`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo anular la orden.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-brand-950/40 font-light">Cargando cuentas por pagar…</p>;

  const totalPending = payables.reduce((acc, p) => acc + Number(p.amountBase), 0);
  const pendingOrders = orders.filter((o) => o.status === 'PENDING');

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-brand-950">Cuentas por pagar</p>
          <p className="text-sm font-bold text-brand-950">{formatBase(totalPending, symbol)}</p>
        </div>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Gastos que tomaste a crédito y todavía no le pagaste al proveedor. Marca los que vas a pagar
          juntos y emite la orden.
        </p>

        {payables.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">
            No tienes cuentas pendientes con proveedores.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-brand-950/[0.06]">
              {payables.map((p) => {
                const blocked = !!lockedSupplier && p.supplier?.id !== lockedSupplier && !selected.has(p.id);
                return (
                  <li key={p.id}>
                    <label
                      className={`flex items-start gap-2.5 py-2.5 ${blocked ? 'opacity-40' : 'cursor-pointer'}`}
                      title={blocked ? 'Una orden de pago es de un solo proveedor.' : undefined}
                    >
                      <input
                        type="checkbox"
                        disabled={blocked}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-brand-950">{p.description}</span>
                        <span className="block text-xs font-light text-brand-950/50">
                          {p.supplier?.name ?? 'Sin proveedor'}
                          {p.referenceNumber && ` · Ref. ${p.referenceNumber}`}
                          {' · '}
                          {new Date(p.expenseDate ?? p.createdAt).toLocaleDateString('es-VE')}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-brand-950">
                        {formatBase(p.amountBase, symbol)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {selected.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brand-950/10 pt-3">
                <p className="text-sm text-brand-950">
                  {selected.size} seleccionada{selected.size === 1 ? '' : 's'} ·{' '}
                  <span className="font-bold">{formatBase(selectedTotal, symbol)}</span>
                </p>
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={busy}
                  className="!w-auto disabled:opacity-50"
                  onClick={createOrder}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {busy ? 'Emitiendo…' : 'Emitir orden de pago'}
                </TextureButton>
              </div>
            )}
          </>
        )}
      </div>

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-brand-950">Órdenes de pago</p>
          {pendingOrders.length > 0 && (
            <p className="text-xs font-medium text-amber-700">{pendingOrders.length} por pagar</p>
          )}
        </div>

        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">Todavía no has emitido ninguna orden.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-brand-950/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brand-950">Orden #{o.orderNumber}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <p className="mt-0.5 text-xs font-light text-brand-950/50">
                      {o.supplier?.name ?? 'Sin proveedor'} · {o.movements.length} cuenta
                      {o.movements.length === 1 ? '' : 's'} ·{' '}
                      {new Date(o.createdAt).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-brand-950">{formatBase(o.amountBase, symbol)}</p>
                </div>

                <ul className="mt-2 space-y-0.5">
                  {o.movements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 text-xs text-brand-950/60">
                      <span className="min-w-0 truncate font-light">{m.description}</span>
                      <span className="shrink-0">{formatBase(m.amountBase, symbol)}</span>
                    </li>
                  ))}
                </ul>

                {o.status === 'PAID' && (
                  <p className="mt-2 text-xs font-light text-emerald-700">
                    Pagada el {new Date(o.paidAt!).toLocaleDateString('es-VE')}
                    {o.paymentMethod && ` · ${METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}`}
                    {o.referenceNumber && ` · Ref. ${o.referenceNumber}`}
                    {o.paidByUser && ` · ${o.paidByUser.name}`}
                  </p>
                )}

                {o.status === 'PENDING' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <TextureButton
                      variant="brand"
                      size="default"
                      disabled={busy}
                      className="!w-auto disabled:opacity-50"
                      onClick={() => setPayingOrder(o)}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Marcar pagada
                    </TextureButton>
                    <button
                      disabled={busy}
                      onClick={() => cancelOrder(o)}
                      className="flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Anular
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {payingOrder && (
        <PayOrderDialog
          order={payingOrder}
          symbol={symbol}
          onClose={() => setPayingOrder(null)}
          onPaid={() => {
            setPayingOrder(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayOrderDialog({
  order,
  symbol,
  onClose,
  onPaid,
}: {
  order: PaymentOrder;
  symbol: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState('TRANSFER');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/payment-orders/${order.id}/pay`, {
        paymentMethod: method,
        referenceNumber: reference.trim() || null,
      });
      onPaid();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar orden #{order.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-brand-950/70">
            {order.supplier?.name ?? 'Sin proveedor'} ·{' '}
            <span className="font-bold text-brand-950">{formatBase(order.amountBase, symbol)}</span>
          </p>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">¿Con qué pagaste?</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Referencia (opcional)</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nº de transferencia o recibo"
              className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Registrando…' : 'Confirmar pago'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: PaymentOrder['status'] }) {
  const map = {
    PENDING: { label: 'Por pagar', className: 'bg-amber-100 text-amber-700' },
    PAID: { label: 'Pagada', className: 'bg-emerald-100 text-emerald-700' },
    CANCELLED: { label: 'Anulada', className: 'bg-brand-950/10 text-brand-950/50' },
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map.className}`}>{map.label}</span>;
}
