import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import type { PaymentMethod } from '@/types';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { CheckCircle2, History, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PAYMENT_LABELS } from './PaymentDialog.shared';

type Refund = {
  id: string; orderId: string; amountBase: string; amountBs: string | null;
  method: PaymentMethod; reason: string; referenceNumber: string | null;
  fiscalCreditNoteRef: string | null; createdByName: string; createdAt: string;
  order?: { orderNumber: number; customerName: string | null; currency: string };
};

type FoundOrder = {
  id: string; orderNumber: number; customerName: string | null; totalBase: string;
  currency: string; exchangeRate: string; fiscalPrintedAt: string | null;
  fiscalPrinterInvoice: string | null; collectedBase: string; refundedBase: string;
  refundableBase: string; refunds: Refund[];
};

type BankAccount = { id: string; name: string; currency: string; paymentMethods: PaymentMethod[] };
const METHODS: PaymentMethod[] = ['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];
const BS_METHODS = new Set<PaymentMethod>(['CASH', 'MOBILE_PAYMENT', 'CARD', 'TRANSFER']);
const REASON_PRESETS = ['Devolución al cliente', 'Cancelación de pedido', 'Error en cobro', 'Plato devuelto', 'Cobro duplicado'];

export function OrderRefundDialog({
  initialOrderNumber,
  initialOrderId,
  onClose,
  onRefundRecorded,
}: {
  initialOrderNumber?: number | string;
  initialOrderId?: string;
  onClose: () => void;
  onRefundRecorded?: () => void;
}) {
  const { restaurant } = useAuth();
  const symbol = CURRENCY_SYMBOLS[restaurant?.baseCurrency ?? 'USD'];
  const [number, setNumber] = useState(initialOrderNumber ? String(initialOrderNumber) : '');
  const [order, setOrder] = useState<FoundOrder | null>(null);
  const [recent, setRecent] = useState<Refund[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [amount, setAmount] = useState('');
  const [amountBs, setAmountBs] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('Devolución al cliente');
  const [reference, setReference] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const initialFetchDone = useRef(false);

  useEffect(() => {
    api.get('/orders/refunds').then((r) => setRecent(r.data.data)).catch(() => {});
    api.get('/bank-accounts').then((r) => setAccounts(r.data.data)).catch(() => {});
  }, []);

  async function findOrder(target?: { orderNumber?: string | number; orderId?: string }) {
    setError(null);
    setSuccess(null);
    setLoading(true);
    setOrder(null);
    try {
      const orderNum = target?.orderNumber ?? (number.trim() ? number.trim() : undefined);
      const orderId = target?.orderId ?? (initialOrderId && !number.trim() ? initialOrderId : undefined);
      const response = await api.get('/orders/refunds/lookup', {
        params: {
          ...(orderNum ? { orderNumber: orderNum } : {}),
          ...(orderId ? { orderId } : {}),
        },
      });
      const data: FoundOrder = response.data.data;
      setOrder(data);
      setNumber(String(data.orderNumber));
      const refBase = Number(data.refundableBase);
      if (refBase > 0) {
        setAmount(data.refundableBase);
        const rate = Number(data.exchangeRate) || 1;
        setAmountBs((refBase * rate).toFixed(2));
      } else {
        setAmount('');
        setAmountBs('');
      }
      setReason('Devolución al cliente');
      setReference('');
      setCreditNote('');
      setConfirmed(true);
      setRequestKey(crypto.randomUUID());
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo consultar la comanda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialFetchDone.current) return;
    if (initialOrderNumber || initialOrderId) {
      initialFetchDone.current = true;
      void findOrder({ orderNumber: initialOrderNumber, orderId: initialOrderId });
    }
  }, [initialOrderNumber, initialOrderId]);

  function handleAmountChange(val: string) {
    setAmount(val);
    setError(null);
    const num = Number(val);
    if (!isNaN(num) && num > 0 && order) {
      const rate = Number(order.exchangeRate) || 1;
      setAmountBs((num * rate).toFixed(2));
    } else {
      setAmountBs('');
    }
  }

  function handleSetFullAmount() {
    if (!order) return;
    const refBase = Number(order.refundableBase);
    setAmount(order.refundableBase);
    const rate = Number(order.exchangeRate) || 1;
    setAmountBs((refBase * rate).toFixed(2));
    setError(null);
  }

  async function save() {
    if (!order || saving) return;
    setError(null);
    setSuccess(null);

    const numAmount = Number(amount);
    const maxAmount = Number(order.refundableBase);
    if (maxAmount <= 0) {
      setError('Esta comanda no tiene saldo disponible para devolver.');
      return;
    }
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setError('Indica el monto que deseas devolver.');
      return;
    }
    if (numAmount > maxAmount + 0.0001) {
      setError(`El monto supera el disponible (${formatBase(order.refundableBase, symbol)}).`);
      return;
    }
    if (!confirmed) {
      setError('Debes confirmar la entrega del dinero.');
      return;
    }

    setSaving(true);
    try {
      const cleanReason = reason.trim() || 'Devolución al cliente';
      await api.post(`/orders/${order.id}/refunds`, {
        requestKey,
        amountBase: numAmount,
        ...(BS_METHODS.has(method) && Number(amountBs) > 0 ? { amountBs: Number(amountBs) } : {}),
        method,
        reason: cleanReason,
        referenceNumber: reference.trim() || undefined,
        fiscalCreditNoteRef: creditNote.trim() || undefined,
        bankAccountId: bankAccountId || undefined,
      });
      setRequestKey(crypto.randomUUID());
      setSuccess(`Devolución de ${formatBase(numAmount, symbol)} registrada con éxito.`);

      const [detail, log] = await Promise.all([
        api.get('/orders/refunds/lookup', { params: { orderNumber: order.orderNumber } }),
        api.get('/orders/refunds'),
      ]);
      const updatedOrder = detail.data.data;
      setOrder(updatedOrder);
      setRecent(log.data.data);
      const remaining = Number(updatedOrder.refundableBase);
      if (remaining > 0) {
        setAmount(updatedOrder.refundableBase);
        const rate = Number(updatedOrder.exchangeRate) || 1;
        setAmountBs((remaining * rate).toFixed(2));
      } else {
        setAmount('');
        setAmountBs('');
      }
      setReference('');
      setCreditNote('');
      onRefundRecorded?.();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo registrar la devolución.');
    } finally {
      setSaving(false);
    }
  }

  const matchingAccounts = accounts.filter((a) => a.paymentMethods.includes(method));
  const refundable = Number(order?.refundableBase ?? 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand-500" />
            Devoluciones a clientes
          </DialogTitle>
        </DialogHeader>
        <p className="text-brand-950/60 text-sm">
          Registra el dinero entregado de vuelta al cliente. La comanda original y su registro contable se conservan transparentemente en el sistema.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); void findOrder(); }} className="flex gap-2">
          <input
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="Número de comanda (ej. 142)"
            aria-label="Número de comanda"
            className="min-w-0 flex-1 rounded-xl border border-brand-950/15 px-3 py-2 text-base focus:border-brand-500 focus:outline-none"
          />
          <TextureButton type="submit" variant="brand" size="sm" className="!w-auto" disabled={loading || !number.trim()}>
            {loading ? 'Buscando…' : 'Buscar comanda'}
          </TextureButton>
        </form>

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-700 text-sm font-medium border border-red-200">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-800 text-sm font-medium border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            {success}
          </div>
        )}

        {order && (
          <div className="space-y-4 rounded-xl border border-brand-950/10 p-3 sm:p-4 bg-brand-950/[0.015]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-950/10 pb-3">
              <div>
                <span className="text-base font-bold text-brand-950">Comanda #{order.orderNumber}</span>
                {order.customerName && <span className="text-brand-950/60 text-sm"> · {order.customerName}</span>}
              </div>
              <div className="text-xs text-brand-950/60">
                Tasa comanda: <strong className="text-brand-950">{order.exchangeRate} Bs/{symbol}</strong>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-2 border border-brand-950/10">
                <span className="text-[11px] text-brand-950/50 block font-medium">Cobrado</span>
                <span className="text-sm font-semibold text-brand-950">{formatBase(order.collectedBase, symbol)}</span>
              </div>
              <div className="rounded-lg bg-white p-2 border border-brand-950/10">
                <span className="text-[11px] text-brand-950/50 block font-medium">Ya devuelto</span>
                <span className="text-sm font-semibold text-brand-950">{formatBase(order.refundedBase, symbol)}</span>
              </div>
              <div className={`rounded-lg p-2 border ${refundable > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                <span className="text-[11px] block font-medium">Disponible</span>
                <span className="text-sm font-bold">{formatBase(order.refundableBase, symbol)}</span>
              </div>
            </div>

            {order.fiscalPrintedAt && (
              <div className="rounded-lg bg-amber-50 p-2.5 text-amber-900 text-xs border border-amber-200">
                Esta venta tiene factura fiscal {order.fiscalPrinterInvoice ?? ''}. Registrar la devolución del dinero no emite nota de crédito fiscal automática; si requieres documento fiscal, tramítalo desde la impresora.
              </div>
            )}

            {refundable <= 0 ? (
              <div className="rounded-xl bg-gray-50 p-3 text-center text-brand-950/60 text-sm border border-brand-950/10">
                Esta comanda no tiene dinero cobrado pendiente de devolver (o ya fue devuelto completamente).
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-brand-950/70 text-xs font-semibold">Monto en {symbol} *</label>
                    <button
                      type="button"
                      onClick={handleSetFullAmount}
                      className="text-[11px] text-brand-600 font-medium hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> Devolver todo ({formatBase(order.refundableBase, symbol)})
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    max={order.refundableBase}
                    step="0.01"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base font-semibold focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="text-brand-950/70 text-xs font-semibold block mb-1">Medio real de devolución</label>
                  <select
                    value={method}
                    onChange={(e) => {
                      setMethod(e.target.value as PaymentMethod);
                      setBankAccountId('');
                    }}
                    className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base bg-white focus:border-brand-500 focus:outline-none"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                    ))}
                  </select>
                </div>

                {BS_METHODS.has(method) && (
                  <div className="sm:col-span-2 rounded-lg bg-brand-950/[0.03] p-2.5 border border-brand-950/10">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-brand-950/70 text-xs font-semibold">Equivalente entregado en Bolívares (Bs)</label>
                      <span className="text-[11px] text-brand-950/50">Calculado a {order.exchangeRate} Bs/{symbol}</span>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amountBs}
                      onChange={(e) => setAmountBs(e.target.value)}
                      placeholder="Monto en Bs"
                      className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base font-medium bg-white focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                )}

                {matchingAccounts.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="text-brand-950/70 text-xs font-semibold block mb-1">Cuenta de salida (opcional)</label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm bg-white focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Cuenta vinculada al medio por defecto</option>
                      {matchingAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-brand-950/70 text-xs font-semibold block">Motivo de devolución</label>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {REASON_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setReason(preset)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                          reason === preset
                            ? 'bg-brand-500 text-white border-brand-500'
                            : 'bg-white text-brand-950/70 border-brand-950/15 hover:bg-brand-950/5'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    placeholder="Explica brevemente el motivo"
                    className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="text-brand-950/70 text-xs font-semibold block mb-1">
                    Referencia de salida <span className="font-normal text-brand-950/40">(opcional)</span>
                  </label>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={80}
                    placeholder="N.º operación o comprobante"
                    className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>

                {order.fiscalPrintedAt && (
                  <div className="sm:col-span-1">
                    <label className="text-brand-950/70 text-xs font-semibold block mb-1">
                      N.º de nota de crédito <span className="font-normal text-brand-950/40">(si existe)</span>
                    </label>
                    <input
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      maxLength={80}
                      placeholder="NC física emitida"
                      className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="sm:col-span-2 pt-1">
                  <label className="flex items-start gap-2 text-brand-950/80 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-brand-950/20 text-brand-500 focus:ring-brand-500"
                    />
                    <span>Confirmo que el dinero ya fue entregado al cliente por el medio y monto indicados.</span>
                  </label>
                </div>

                <div className="sm:col-span-2 pt-2">
                  <TextureButton
                    variant="brand"
                    size="sm"
                    className="w-full py-2.5 text-base font-semibold"
                    disabled={saving || refundable <= 0}
                    onClick={save}
                  >
                    {saving ? 'Registrando devolución…' : `Confirmar devolución (${formatBase(amount || 0, symbol)})`}
                  </TextureButton>
                </div>
              </div>
            )}

            {order.refunds.length > 0 && (
              <div className="space-y-2 border-t border-brand-950/10 pt-3">
                <p className="font-semibold text-brand-950 text-xs flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-brand-500" />
                  Devoluciones ya registradas en esta comanda ({order.refunds.length})
                </p>
                <div className="space-y-1.5">
                  {order.refunds.map((r) => (
                    <div key={r.id} className="rounded-lg bg-white p-2 text-xs border border-brand-950/10 flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-brand-950">{formatBase(r.amountBase, symbol)}</span>
                        {r.amountBs && <span className="text-brand-950/50"> ({r.amountBs} Bs)</span>}
                        <span className="text-brand-950/60 block">{PAYMENT_LABELS[r.method]} · {r.reason}</span>
                        {r.referenceNumber && <span className="text-brand-950/40 block">Ref: {r.referenceNumber}</span>}
                        {r.fiscalCreditNoteRef && <span className="text-brand-950/40 block">NC: {r.fiscalCreditNoteRef}</span>}
                      </div>
                      <div className="text-right text-[11px] text-brand-950/40 shrink-0">
                        <span>{r.createdByName}</span>
                        <span className="block">{new Date(r.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!order && recent.length > 0 && (
          <div className="space-y-1.5 border-t border-brand-950/10 pt-3">
            <p className="font-semibold text-brand-950 text-xs">Últimas devoluciones registradas</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recent.slice(0, 8).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    const num = String(r.order?.orderNumber ?? '');
                    setNumber(num);
                    void findOrder({ orderNumber: num });
                  }}
                  className="flex w-full justify-between items-center gap-2 py-1.5 px-2 rounded-lg text-left text-xs text-brand-950/70 hover:bg-brand-950/5 hover:text-brand-950 transition-colors"
                >
                  <span className="font-medium">#{r.order?.orderNumber} · {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('es-VE')}</span>
                  <span className="font-bold text-brand-950">{formatBase(r.amountBase, symbol)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
