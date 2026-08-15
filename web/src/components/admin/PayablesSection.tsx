import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, FileText, Plus, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { methodAccountsOf } from '@/utils/payment-accounts';
import { TextureButton } from '@/components/ui/texture-button';
import {
  DocumentAttachmentsField,
  DocumentAttachmentsList,
  type DocumentAttachment,
} from '@/components/admin/DocumentAttachmentsField';
import { InlinePanel } from './InlinePanel';
import { ExpenseForm } from './ExpenseFormDialog';
import { MethodAccountPicker } from './MethodAccountPicker';

interface Payable {
  id: string;
  description: string;
  amountBase: string;
  category: string | null;
  expenseDate: string | null;
  invoiceDueDate: string | null;
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
  paidAmountBase: string | null;
  paidAmountBs: string | null;
  islrRetentionBase: string | null;
  ivaRetentionBase: string | null;
  creditNoteBase: string | null;
  ivaAmountBase: string | null;
  totalWithIvaBase: string | null;
  supplier: { id: string; name: string; taxId: string | null } | null;
  createdByUser: { name: string } | null;
  paidByUser: { name: string } | null;
  movements: { id: string; description: string; amountBase: string; creditPaidAt: string | null }[];
  attachments: DocumentAttachment[] | null;
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

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

/** Días que faltan para el vencimiento de la factura (negativo = vencida), en días calendario. */
function daysToDue(invoiceDueDate: string): number {
  const due = new Date(invoiceDueDate);
  const today = new Date();
  due.setHours(12, 0, 0, 0);
  today.setHours(12, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function DueDatePill({ invoiceDueDate }: { invoiceDueDate: string }) {
  const days = daysToDue(invoiceDueDate);
  if (days < 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
        Vencida hace {-days} día{days === -1 ? '' : 's'}
      </span>
    );
  }
  if (days === 0) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Vence hoy</span>;
  }
  if (days <= 7) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
        Vence en {days} día{days === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-[10px] font-medium text-brand-950/50">
      Vence el {new Date(invoiceDueDate).toLocaleDateString('es-VE')}
    </span>
  );
}

/**
 * Cuentas por pagar a proveedores y sus órdenes de pago — compartido por los tres verticales
 * (Restaurantes, Locales, Canchas), todo en línea (InlinePanel, sin ventanas flotantes).
 *
 * Una cuenta por pagar es un gasto tomado a crédito todavía sin saldar. La orden de pago
 * agrupa varias en un documento con correlativo para autorizarlas y pagarlas de una vez.
 * Al pagar se registra el detalle fiscal: monto realmente pagado (en $ o Bs a la tasa del
 * día), retenciones ISLR/IVA, nota de crédito y el desglose IVA/total de la factura.
 */
export function PayablesSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [payables, setPayables] = useState<Payable[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Soportes que se adjuntan al emitir la orden (facturas del proveedor, presupuestos).
  const [newOrderDocs, setNewOrderDocs] = useState<DocumentAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PaymentOrder | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

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

  const selectedTotal = payables.filter((p) => selected.has(p.id)).reduce((acc, p) => acc + Number(p.amountBase), 0);

  async function createOrder() {
    if (selected.size === 0) {
      setError('Marca al menos una cuenta por pagar para crear la orden.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/payment-orders', { movementIds: [...selected], attachments: newOrderDocs });
      setSelected(new Set());
      setNewOrderDocs([]);
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

  // Pagar una orden toma la vista completa (mismo patrón en línea que el resto de Administración).
  if (payingOrder) {
    return (
      <PayOrderPanel
        order={payingOrder}
        symbol={symbol}
        onClose={() => setPayingOrder(null)}
        onPaid={() => {
          setPayingOrder(null);
          load();
        }}
      />
    );
  }

  const totalPending = payables.reduce((acc, p) => acc + Number(p.amountBase), 0);
  const pendingOrders = orders.filter((o) => o.status === 'PENDING');
  const overdue = payables.filter((p) => p.invoiceDueDate && daysToDue(p.invoiceDueDate) < 0).length;
  const dueSoon = payables.filter((p) => {
    if (!p.invoiceDueDate) return false;
    const d = daysToDue(p.invoiceDueDate);
    return d >= 0 && d <= 7;
  }).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto"
          onClick={() => setShowExpenseForm((s) => !s)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Registrar gasto
        </TextureButton>
        <TextureButton variant="brand" size="sm" className="!w-auto disabled:opacity-50" disabled={busy} onClick={createOrder}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Crear orden de pago
        </TextureButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showExpenseForm && (
        <InlinePanel
          title="Registrar gasto"
          description="Márcalo «¿A crédito?» para que entre a Cuentas por pagar y puedas incluirlo en una orden."
          onClose={() => setShowExpenseForm(false)}
        >
          <ExpenseForm
            onCreated={() => {
              setShowExpenseForm(false);
              load();
            }}
          />
        </InlinePanel>
      )}

      {(overdue > 0 || dueSoon > 0) && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            {overdue > 0 && (
              <span className="font-semibold">
                {overdue} factura{overdue === 1 ? '' : 's'} vencida{overdue === 1 ? '' : 's'}
              </span>
            )}
            {overdue > 0 && dueSoon > 0 && ' · '}
            {dueSoon > 0 && (
              <span>
                {dueSoon} por vencer en los próximos 7 días
              </span>
            )}
            . Revisa la lista y emite la orden de pago antes del vencimiento.
          </p>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-brand-950">Cuentas por pagar</p>
          <p className="text-sm font-bold text-brand-950">{formatBase(totalPending, symbol)}</p>
        </div>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Gastos que tomaste a crédito y todavía no le pagaste al proveedor. Marca los que vas a pagar
          juntos y crea la orden.
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
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm text-brand-950">{p.description}</span>
                          {p.invoiceDueDate && <DueDatePill invoiceDueDate={p.invoiceDueDate} />}
                        </span>
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
              <div className="mt-3 border-t border-brand-950/10 pt-3">
                <DocumentAttachmentsField
                  uploadUrl="/payment-orders/upload-document"
                  value={newOrderDocs}
                  onChange={setNewOrderDocs}
                  stage="ORDER"
                  label="Documentos de la orden (opcional)"
                  hint="Fotos o PDF: facturas del proveedor, presupuestos, notas de entrega."
                />
              </div>
            )}

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
                  {busy ? 'Emitiendo…' : 'Crear orden de pago'}
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

                {o.status === 'PAID' && <PaidOrderDetail order={o} symbol={symbol} />}

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
                      Pagar orden
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
    </div>
  );
}

/** Desglose fiscal de una orden ya pagada: lo pagado (en $ y Bs si aplicó), IVA, retenciones
 * y nota de crédito — el detalle completo que autorizó/registró quien la pagó. */
function PaidOrderDetail({ order: o, symbol }: { order: PaymentOrder; symbol: string }) {
  const retentions = Number(o.islrRetentionBase ?? 0) + Number(o.ivaRetentionBase ?? 0);
  const rows: { label: string; value: string }[] = [];
  if (o.paidAmountBase != null) {
    rows.push({
      label: 'Monto pagado',
      value: `${formatBase(o.paidAmountBase, symbol)}${o.paidAmountBs != null ? ` (${formatBsAbsolute(o.paidAmountBs)})` : ''}`,
    });
  }
  if (o.ivaAmountBase != null) rows.push({ label: 'Monto IVA', value: formatBase(o.ivaAmountBase, symbol) });
  if (o.totalWithIvaBase != null) rows.push({ label: 'Total con IVA', value: formatBase(o.totalWithIvaBase, symbol) });
  if (o.islrRetentionBase != null) rows.push({ label: 'Retención ISLR', value: `−${formatBase(o.islrRetentionBase, symbol)}` });
  if (o.ivaRetentionBase != null) rows.push({ label: 'Retención IVA', value: `−${formatBase(o.ivaRetentionBase, symbol)}` });
  if (retentions > 0) rows.push({ label: 'Total retenciones', value: `−${formatBase(retentions, symbol)}` });
  if (o.creditNoteBase != null) rows.push({ label: 'Nota de crédito', value: `−${formatBase(o.creditNoteBase, symbol)}` });

  return (
    <div className="mt-2 border-t border-brand-950/[0.06] pt-2">
      <p className="text-xs font-light text-emerald-700">
        Pagada el {new Date(o.paidAt!).toLocaleDateString('es-VE')}
        {o.paymentMethod && ` · ${METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}`}
        {o.referenceNumber && ` · Ref. ${o.referenceNumber}`}
        {o.paidByUser && ` · ${o.paidByUser.name}`}
      </p>
      <DocumentAttachmentsList attachments={o.attachments ?? []} />
      {rows.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2 text-xs">
              <span className="text-brand-950/50">{r.label}</span>
              <span className={`font-medium ${r.label === 'Total retenciones' ? 'text-brand-950' : 'text-brand-950/70'}`}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pantalla de pago de una orden: monto realmente pagado (en $ o Bs a la tasa del día),
 * método/referencia y el detalle fiscal (IVA, retenciones ISLR/IVA, nota de crédito), con el
 * total de retenciones y el neto sugerido calculados en vivo. */
function PayOrderPanel({
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
  const { restaurant } = useAuth();
  const [method, setMethod] = useState('TRANSFER');
  // Cuenta del método de la que salió el dinero, cuando tiene varias (varios Zelle…).
  const [accountKey, setAccountKey] = useState('main');
  const [reference, setReference] = useState('');
  const [paidAmount, setPaidAmount] = useState(Number(order.amountBase).toFixed(2));
  const [paidCurrency, setPaidCurrency] = useState<'BASE' | 'BS'>('BASE');
  const [ivaAmount, setIvaAmount] = useState('');
  const [totalWithIva, setTotalWithIva] = useState('');
  const [islrRetention, setIslrRetention] = useState('');
  const [ivaRetention, setIvaRetention] = useState('');
  const [creditNote, setCreditNote] = useState('');
  // Soportes del pago: comprobante de la transferencia, planillas de retención, nota de crédito.
  const [docs, setDocs] = useState<DocumentAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => Number(s) || 0;
  const methodAccounts = methodAccountsOf(restaurant?.paymentMethodsConfig, method);
  const selectedAccount = methodAccounts.find((a) => a.key === accountKey) ?? methodAccounts[0] ?? null;
  const totalRetentions = num(islrRetention) + num(ivaRetention);
  // Neto sugerido: lo que queda por transferirle al proveedor después de restar lo retenido
  // y la nota de crédito, partiendo del total con IVA (o del monto de la orden si no se cargó).
  const baseTotal = num(totalWithIva) || Number(order.amountBase);
  const suggestedNet = Math.max(0, baseTotal - totalRetentions - num(creditNote));

  const inputCls =
    'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/payment-orders/${order.id}/pay`, {
        paymentMethod: method,
        referenceNumber: reference.trim() || null,
        paidAmount: num(paidAmount) || null,
        paidCurrency,
        islrRetentionBase: islrRetention !== '' ? num(islrRetention) : null,
        ivaRetentionBase: ivaRetention !== '' ? num(ivaRetention) : null,
        creditNoteBase: creditNote !== '' ? num(creditNote) : null,
        ivaAmountBase: ivaAmount !== '' ? num(ivaAmount) : null,
        totalWithIvaBase: totalWithIva !== '' ? num(totalWithIva) : null,
        bankAccountId: selectedAccount?.bankAccountId ?? null,
        attachments: docs,
      });
      onPaid();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
      setSaving(false);
    }
  }

  return (
    <InlinePanel
      title={`Pagar orden #${order.orderNumber}`}
      description={`${order.supplier?.name ?? 'Sin proveedor'} · Monto autorizado: ${formatBase(order.amountBase, symbol)}`}
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-950/10 p-3">
          <p className="mb-1.5 text-xs font-medium text-brand-950/50">Cuentas incluidas</p>
          <ul className="space-y-0.5">
            {order.movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 text-xs text-brand-950/60">
                <span className="min-w-0 truncate font-light">{m.description}</span>
                <span className="shrink-0">{formatBase(m.amountBase, symbol)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <p className="mb-1 text-[13px] font-medium text-brand-950/70">Monto a pagar</p>
            <input
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
          <div>
            <p className="mb-1 text-[13px] font-medium text-brand-950/70">Moneda</p>
            <select value={paidCurrency} onChange={(e) => setPaidCurrency(e.target.value as 'BASE' | 'BS')} className={inputCls}>
              <option value="BASE">{symbol}</option>
              <option value="BS">Bs</option>
            </select>
          </div>
        </div>
        {paidCurrency === 'BS' && (
          <p className="-mt-2 text-[11px] font-light text-brand-950/40">
            Se convierte a {symbol} con la tasa BCV del momento del pago — por eso puede diferir del monto autorizado al
            emitir la orden.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">¿Con qué pagaste?</span>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setAccountKey('main');
              }}
              className={inputCls}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <MethodAccountPicker
              accounts={methodAccounts}
              value={selectedAccount?.key ?? 'main'}
              onChange={setAccountKey}
              label="¿De cuál cuenta salió?"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Referencia (opcional)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de transferencia o recibo" className={inputCls} />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-950/40">Detalle de la factura</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Monto IVA</span>
              <input value={ivaAmount} onChange={(e) => setIvaAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Total con IVA</span>
              <input value={totalWithIva} onChange={(e) => setTotalWithIva(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={inputCls} />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-950/40">Retenciones y nota de crédito</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Retención ISLR</span>
              <input value={islrRetention} onChange={(e) => setIslrRetention(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Retención IVA</span>
              <input value={ivaRetention} onChange={(e) => setIvaRetention(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Nota de crédito</span>
              <input value={creditNote} onChange={(e) => setCreditNote(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className={inputCls} />
            </label>
          </div>
        </div>

        {/* Los montos de arriba están en moneda base ({symbol}); las retenciones son editables
            hasta el momento de confirmar — este resumen se recalcula en vivo. */}
        <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-3 space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-brand-950/60">Total retenciones (ISLR + IVA)</span>
            <span className="font-semibold text-brand-950">{formatBase(totalRetentions, symbol)}</span>
          </div>
          {num(creditNote) > 0 && (
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-brand-950/60">Nota de crédito</span>
              <span className="font-medium text-brand-950/70">−{formatBase(num(creditNote), symbol)}</span>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-brand-950/[0.06] pt-1 text-sm">
            <span className="text-brand-950/60">Neto sugerido a pagar</span>
            <span className="font-bold text-brand-950">{formatBase(suggestedNet, symbol)}</span>
          </div>
        </div>

        <DocumentAttachmentsField
          uploadUrl="/payment-orders/upload-document"
          value={docs}
          onChange={setDocs}
          stage="PAYMENT"
          label="Documentos del pago (opcional)"
          hint="Fotos o PDF: comprobante de la transferencia, planillas de retención, nota de crédito."
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
          {saving ? 'Registrando…' : 'Confirmar pago'}
        </TextureButton>
      </div>
    </InlinePanel>
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
