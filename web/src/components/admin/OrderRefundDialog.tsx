import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import type { PaymentMethod } from '@/types';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { useEffect, useState } from 'react';
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

export function OrderRefundDialog({ onClose }: { onClose: () => void }) {
  const { restaurant } = useAuth();
  const symbol = CURRENCY_SYMBOLS[restaurant?.baseCurrency ?? 'USD'];
  const [number, setNumber] = useState('');
  const [order, setOrder] = useState<FoundOrder | null>(null);
  const [recent, setRecent] = useState<Refund[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [amount, setAmount] = useState('');
  const [amountBs, setAmountBs] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    api.get('/orders/refunds').then((r) => setRecent(r.data.data)).catch(() => {});
    api.get('/bank-accounts').then((r) => setAccounts(r.data.data)).catch(() => {});
  }, []);

  async function findOrder(orderNumber = number) {
    setError(null);
    setLoading(true);
    setOrder(null);
    try {
      const response = await api.get('/orders/refunds/lookup', { params: { orderNumber } });
      setOrder(response.data.data);
      setAmount('');
      setAmountBs('');
      setReason('');
      setReference('');
      setCreditNote('');
      setConfirmed(false);
      setRequestKey(crypto.randomUUID());
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo consultar la comanda.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!order || saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/orders/${order.id}/refunds`, {
        requestKey,
        amountBase: Number(amount),
        ...(BS_METHODS.has(method) ? { amountBs: Number(amountBs) } : {}),
        method,
        reason: reason.trim(),
        referenceNumber: reference.trim() || undefined,
        fiscalCreditNoteRef: creditNote.trim() || undefined,
        bankAccountId: bankAccountId || undefined,
      });
      setRequestKey(crypto.randomUUID());
      const [detail, log] = await Promise.all([
        api.get('/orders/refunds/lookup', { params: { orderNumber: order.orderNumber } }),
        api.get('/orders/refunds'),
      ]);
      setOrder(detail.data.data);
      setRecent(log.data.data);
      setAmount('');
      setAmountBs('');
      setReason('');
      setReference('');
      setCreditNote('');
      setConfirmed(false);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo registrar la devolución.');
    } finally {
      setSaving(false);
    }
  }

  const matchingAccounts = accounts.filter((a) => a.paymentMethods.includes(method));
  const valid = order && Number(amount) > 0 && Number(amount) <= Number(order.refundableBase)
    && reason.trim().length >= 5 && (!BS_METHODS.has(method) || Number(amountBs) > 0)
    && (['CASH', 'CASH_USD'].includes(method) || reference.trim().length > 0) && confirmed;

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Devoluciones a clientes</DialogTitle></DialogHeader>
        <p className="text-brand-950/60 text-base">Registra únicamente dinero que ya entregaste al cliente. La comanda y el cobro original permanecen en el historial.</p>
        <form onSubmit={(e) => { e.preventDefault(); void findOrder(); }} className="flex gap-2">
          <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="Número de comanda" aria-label="Número de comanda"
            className="min-w-0 flex-1 rounded-xl border border-brand-950/15 px-3 py-2 text-base" />
          <TextureButton type="submit" variant="brand" size="sm" className="!w-auto" disabled={loading || !number}>
            {loading ? 'Buscando…' : 'Buscar'}
          </TextureButton>
        </form>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-red-700 text-base">{error}</p>}
        {order && (
          <div className="space-y-3 rounded-xl border border-brand-950/10 p-3">
            <div className="text-sm font-semibold text-brand-950">Comanda #{order.orderNumber}{order.customerName && ` · ${order.customerName}`}</div>
            <p className="text-brand-950/60 text-xs">Cobrado: {formatBase(order.collectedBase, symbol)} · Ya devuelto: {formatBase(order.refundedBase, symbol)} · Disponible: {formatBase(order.refundableBase, symbol)}</p>
            {order.fiscalPrintedAt && (
              <p className="rounded-lg bg-amber-50 p-2 text-amber-900 text-xs">Esta venta tiene factura fiscal {order.fiscalPrinterInvoice ?? ''}. Registrar dinero devuelto no emite ni sustituye la nota de crédito fiscal; tramítala por separado.</p>
            )}
            {Number(order.refundableBase) > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-brand-950/70 text-sm font-medium">Monto en {symbol}
                  <input type="number" min="0.01" max={order.refundableBase} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base" />
                </label>
                <label className="text-brand-950/70 text-sm font-medium">Medio real de devolución
                  <select value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod); setBankAccountId(''); }} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base">
                    {METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                  </select>
                </label>
                {BS_METHODS.has(method) && (
                  <label className="text-brand-950/70 text-sm font-medium">Bs entregados realmente
                    <input type="number" min="0.01" step="0.01" value={amountBs} onChange={(e) => setAmountBs(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base" />
                  </label>
                )}
                {matchingAccounts.length > 0 && (
                  <label className="text-brand-950/70 text-sm font-medium">Cuenta de salida
                    <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base">
                      <option value="">Cuenta vinculada al medio</option>
                      {matchingAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                    </select>
                  </label>
                )}
                <label className="text-brand-950/70 sm:col-span-2 text-sm font-medium">Motivo de devolución
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base" />
                </label>
                <label className="text-brand-950/70 text-sm font-medium">Referencia de salida {['CASH', 'CASH_USD'].includes(method) ? '(opcional)' : '*'}
                  <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base" />
                </label>
                {order.fiscalPrintedAt && <label className="text-brand-950/70 text-sm font-medium">N.º de nota de crédito, si ya existe
                  <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-base" />
                </label>}
                <label className="flex items-start gap-2 text-brand-950/70 sm:col-span-2 text-sm font-medium">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                  Confirmo que el dinero ya fue entregado al cliente por el medio y monto indicados.
                </label>
                <TextureButton variant="brand" size="sm" className="sm:col-span-2" disabled={!valid || saving} onClick={save}>
                  {saving ? 'Registrando…' : 'Registrar devolución'}
                </TextureButton>
              </div>
            )}
            {order.refunds.length > 0 && <div className="space-y-1 border-t border-brand-950/10 pt-2">
              <p className="font-semibold text-brand-950 text-xs">Devoluciones de esta comanda</p>
              {order.refunds.map((r) => <p key={r.id} className="text-brand-950/60 text-xs">{formatBase(r.amountBase, symbol)} · {PAYMENT_LABELS[r.method]} · {r.createdByName} · {new Date(r.createdAt).toLocaleString('es-VE')}<br />{r.reason}{r.fiscalCreditNoteRef ? ` · NC ${r.fiscalCreditNoteRef}` : ''}</p>)}
            </div>}
          </div>
        )}
        {!order && recent.length > 0 && <div className="space-y-1 border-t border-brand-950/10 pt-3">
          <p className="font-semibold text-brand-950 text-xs">Últimas devoluciones</p>
          {recent.slice(0, 8).map((r) => <button key={r.id} type="button" onClick={() => { setNumber(String(r.order?.orderNumber ?? '')); void findOrder(String(r.order?.orderNumber ?? '')); }} className="flex w-full justify-between gap-2 py-1 text-left text-xs text-brand-950/60 hover:text-brand-500">
            <span>#{r.order?.orderNumber} · {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('es-VE')}</span>
            <span>{formatBase(r.amountBase, symbol)}</span>
          </button>)}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
