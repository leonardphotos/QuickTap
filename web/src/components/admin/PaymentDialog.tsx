import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, Camera, Check, Copy, Loader2 } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBs, formatBsAbsolute, formatModifierLabel } from '@/utils/format';
import { canApplyDiscount } from '@/utils/roles';
import type { PaymentMethod } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { LiveOrder, LiveOrderPayment } from './LiveOrdersPanel';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

const DEFAULT_PAYMENT_OPTIONS: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CASH_USD', 'CARD'];

// Métodos que exigen un número de referencia/comprobante al registrar el cobro. Todos menos
// Efectivo Bs/$ (que no dejan rastro que verificar) — mismo criterio que el backend
// (order.dto.ts).
const METHODS_REQUIRING_REFERENCE: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];

// Además de la referencia, estos exigen la FOTO del comprobante — Punto de Venta queda fuera:
// no tiene datos bancarios/QR que mostrar y el ticket impreso ya es su propio comprobante.
const METHODS_REQUIRING_PROOF: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER'];

function referenceLabel(method: PaymentMethod): string {
  return method === 'CARD' ? 'Número de ticket' : 'Número de referencia';
}

const PAYMENT_FIELD_LABELS: Record<string, string> = {
  banco: 'Banco',
  telefono: 'Teléfono',
  cedula: 'Cédula/RIF',
  titular: 'Titular',
  correo: 'Correo',
  id: 'ID',
  cuenta: 'Cuenta',
  rif: 'RIF',
};

interface Props {
  order: LiveOrder;
  mode: 'full' | 'split';
  onClose: () => void;
  /** `fullyPaid` = con este pago la comanda quedó saldada (no fue un abono parcial). */
  onPaid: (fullyPaid: boolean) => void;
}

/** Fila de un pago ya registrado (histórico o hecho en esta misma sesión del diálogo), para el desglose final. */
function PaymentRow({ payment, symbol }: { payment: LiveOrderPayment; symbol: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-brand-950/[0.06] last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-brand-950">{PAYMENT_LABELS[payment.method as PaymentMethod] ?? payment.method}</p>
        {payment.referenceNumber && (
          <p className="text-brand-950/40 truncate">
            Ref: {payment.referenceNumber}
            {payment.proofImageUrl && <span className="text-emerald-600"> · ✓ Comprobante</span>}
          </p>
        )}
        {Number(payment.discountBase ?? 0) > 0 && (
          <p className="text-brand-950/40">Descuento: {formatBase(payment.discountBase!, symbol)}</p>
        )}
      </div>
      <p className="font-semibold text-brand-950 shrink-0">{formatBase(payment.amountBase, symbol)}</p>
    </div>
  );
}

/** "Pagar" / "Pago Fraccionado": selecciona método, muestra sus datos de cobro y registra el pago del pedido. */
export function PaymentDialog({ order, mode, onClose, onPaid }: Props) {
  const { restaurant, user } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const showDiscount = canApplyDiscount(user?.role);

  // Un descuento perdona esa parte de la deuda: cuenta como "saldado" igual que el efectivo cobrado.
  const paidBase = order.payments.reduce((acc, p) => acc + Number(p.amountBase) + Number(p.discountBase ?? 0), 0);
  const balanceBase = Math.max(0, Number(order.totalBase) - paidBase);

  const paymentConfig = restaurant?.paymentMethodsConfig;
  const hasPaymentConfig = paymentConfig && Object.values(paymentConfig).some((m) => m?.enabled);
  const paymentOptions = hasPaymentConfig
    ? (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter((k) => paymentConfig?.[k]?.enabled)
    : DEFAULT_PAYMENT_OPTIONS;

  const [method, setMethod] = useState<PaymentMethod>(paymentOptions[0] ?? 'CASH');
  const [amount, setAmount] = useState(mode === 'split' ? '' : balanceBase.toFixed(2));
  const [discountPercent, setDiscountPercent] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Submodalidad de "Pago fraccionado": por monto libre (de siempre) o eligiendo ítems puntuales.
  const [splitBy, setSplitBy] = useState<'amount' | 'items'>('amount');
  const [pickedQty, setPickedQty] = useState<Record<string, number>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Pagos registrados durante esta sesión del diálogo (para el desglose final, junto a order.payments).
  const [sessionPayments, setSessionPayments] = useState<LiveOrderPayment[]>([]);

  const selectedDetails = paymentConfig?.[method];
  const discountPct = showDiscount && splitBy === 'amount' ? Math.min(100, Math.max(0, Number(discountPercent) || 0)) : 0;
  const discountedBalance = round2(balanceBase * (1 - discountPct / 100));
  const needsReference = METHODS_REQUIRING_REFERENCE.includes(method);
  const needsProof = METHODS_REQUIRING_PROOF.includes(method);

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  function remainingQty(item: LiveOrder['items'][number]) {
    return Math.max(0, item.quantity - item.paidQuantity);
  }

  function stepItem(itemId: string, delta: number, max: number) {
    setPickedQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[itemId] ?? 0) + delta));
      return { ...prev, [itemId]: next };
    });
  }

  const itemsSubtotal = round2(order.items.reduce((acc, it) => acc + Number(it.unitPrice) * (pickedQty[it.id] ?? 0), 0));
  const itemsPickedCount = Object.values(pickedQty).reduce((acc, q) => acc + q, 0);
  // Monto a cobrar ahora mismo — mismo valor que ya se muestra como "Monto a cobrar" más abajo,
  // usado también para el bloque de QR/Bs de Pago Móvil.
  const amountToCharge =
    mode === 'split' && splitBy === 'items' ? itemsSubtotal : mode === 'split' ? Number(amount) || 0 : discountedBalance;

  function onDiscountChange(v: string) {
    const clean = v.replace(/[^0-9.]/g, '');
    setDiscountPercent(clean);
    if (mode === 'full') return; // el monto a cobrar en modo full se muestra calculado, no hace falta tocar `amount`
    const pct = Math.min(100, Math.max(0, Number(clean) || 0));
    setAmount(round2(balanceBase * (1 - pct / 100)).toFixed(2));
  }

  async function copyField(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField((c) => (c === key ? null : c)), 1500);
    } catch {
      // El navegador puede negar el permiso de portapapeles; fallamos en silencio.
    }
  }

  async function handleProofFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingProof(true);
    setProofError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const { data } = await api.post('/orders/upload-payment-proof', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProofUrl(data.data.url);
    } catch (e: any) {
      setProofError(e.response?.data?.error ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingProof(false);
    }
  }

  async function submit() {
    const byItems = mode === 'split' && splitBy === 'items';
    const amountBase = byItems ? itemsSubtotal : mode === 'split' ? Number(amount) : discountedBalance;
    if (byItems) {
      if (itemsPickedCount === 0) {
        setError('Elige al menos un ítem a cobrar.');
        return;
      }
    } else if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    if (amountBase > balanceBase + 0.01) {
      setError(`El monto no puede superar el saldo pendiente (${formatBase(balanceBase, symbol)}).`);
      return;
    }
    if (needsReference && !referenceNumber.trim()) {
      setError(`Escribe el ${referenceLabel(method).toLowerCase()}.`);
      return;
    }
    if (needsProof && !proofUrl) {
      setError('Adjunta la foto del comprobante.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { data } = await api.post(`/orders/${order.id}/payments`, {
        amountBase: byItems ? undefined : amountBase,
        items: byItems
          ? Object.entries(pickedQty)
              .filter(([, qty]) => qty > 0)
              .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
          : undefined,
        method,
        discountPercent: discountPct > 0 ? discountPct : undefined,
        referenceNumber: needsReference ? referenceNumber.trim() : undefined,
        proofImageUrl: needsProof ? (proofUrl ?? undefined) : undefined,
      });
      // El endpoint devuelve el pedido completo (no solo el pago nuevo). Se identifica el/los
      // pago(s) recién creados comparando contra los que ya conocíamos ANTES de este POST — así
      // sessionPayments guarda el objeto real (mismo id que luego traerá `order.payments` al
      // refrescar), en vez de uno inventado en el cliente que nunca podría des-duplicarse.
      const freshPayments: LiveOrderPayment[] = data.data?.payments ?? [];
      const newPayments = freshPayments.filter((fp) => !order.payments.some((p) => p.id === fp.id));
      setSessionPayments((prev) => [...prev, ...newPayments]);
      const remaining = balanceBase - amountBase;
      const fullyPaid = mode === 'full' || remaining <= 0.01;
      onPaid(fullyPaid);
      if (fullyPaid) {
        setShowPrintPrompt(true);
      } else {
        setPaidNow(amountBase);
        setAmount('');
        setReferenceNumber('');
        setProofUrl(null);
        setProofError(null);
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo registrar el pago.');
    } finally {
      setSending(false);
    }
  }

  async function printReceipt() {
    setPrinting(true);
    try {
      await api.post(`/orders/${order.id}/print-receipt`);
    } catch {
      // La estación de impresión puede estar apagada/desconectada; no bloqueamos el cierre por eso.
    } finally {
      setPrinting(false);
      onClose();
    }
  }

  const remainingAfter = paidNow != null ? Math.max(0, balanceBase - paidNow) : balanceBase;
  // `order` es una prop que el padre mantiene sincronizada con el servidor (se refresca
  // en segundo plano apenas hay datos nuevos) — una vez que ese refresco llega, el pago que
  // acabamos de registrar aparece TANTO en `order.payments` como en `sessionPayments` (lo
  // guardamos localmente para no depender de esa carrera). Se filtra por id para no duplicarlo.
  const allPayments = [...order.payments, ...sessionPayments.filter((sp) => !order.payments.some((p) => p.id === sp.id))];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader className={showPrintPrompt || paidNow != null ? undefined : 'flex-row items-center gap-2 pr-6'}>
          {/* Botón de retorno: solo antes de registrar el pago, para que el cajero pueda
              salir y elegir otra modalidad (Pago/Fraccionado/Deuda) si el cliente cambia de
              opinión sobre cómo va a pagar. Una vez registrado el pago ya no tiene sentido
              "volver" — se cierra con "Cerrar"/"Sí, imprimir" más abajo. */}
          {!showPrintPrompt && paidNow == null && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver"
              className="shrink-0 h-8 w-8 rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4 text-brand-950/70" />
            </button>
          )}
          <DialogTitle>{mode === 'full' ? 'Pagar' : 'Pago fraccionado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-brand-950/[0.03] px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-950/60">Total del pedido</span>
              <span className="font-semibold text-brand-950">{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-950/40">Equivalente</span>
              <span className="text-brand-950/50">{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>

          <details className="rounded-xl border border-brand-950/10 px-3 py-2" open>
            <summary className="text-xs font-medium text-brand-950/60 cursor-pointer select-none">
              Detalle del pedido ({order.items.length} {order.items.length === 1 ? 'ítem' : 'ítems'})
            </summary>
            <ul className="text-sm space-y-1 mt-2 max-h-32 overflow-y-auto">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{it.quantity}x</span> {it.productName}
                    {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && (
                      <span className="text-brand-950/50"> ({it.modifiers.map(formatModifierLabel).join(', ')})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          {paidBase > 0 && (
            <div className="flex items-center justify-between text-sm bg-brand-950/[0.03] rounded-xl px-3 py-2.5 -mt-2">
              <span className="text-brand-950/60">Ya pagado</span>
              <span className="font-medium text-emerald-600">{formatBase(paidBase, symbol)}</span>
            </div>
          )}

          {showPrintPrompt ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium text-emerald-600">✓ Cuenta saldada</p>
              {allPayments.length > 0 && (
                <div className="text-left rounded-xl border border-brand-950/10 px-3 py-2">
                  {allPayments.map((p) => (
                    <PaymentRow key={p.id} payment={p} symbol={symbol} />
                  ))}
                </div>
              )}
              <p className="text-sm text-brand-950/70">¿Desea imprimir la cuenta?</p>
              <div className="flex gap-2 justify-center">
                <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-50" disabled={printing} onClick={printReceipt}>
                  {printing ? 'Imprimiendo…' : 'Sí, imprimir'}
                </TextureButton>
                <TextureButton variant="secondary" size="default" className="!w-auto" disabled={printing} onClick={onClose}>
                  No
                </TextureButton>
              </div>
            </div>
          ) : paidNow != null ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium text-emerald-600">
                ✓ Pago de {formatBase(paidNow, symbol)} registrado
              </p>
              {allPayments.length > 0 && (
                <div className="text-left rounded-xl border border-brand-950/10 px-3 py-2">
                  {allPayments.map((p) => (
                    <PaymentRow key={p.id} payment={p} symbol={symbol} />
                  ))}
                </div>
              )}
              {remainingAfter > 0.01 ? (
                <p className="text-sm text-brand-950/60">
                  Aún debe <span className="font-semibold text-brand-950">{formatBase(remainingAfter, symbol)}</span>
                </p>
              ) : (
                <p className="text-sm text-brand-950/60">Cuenta saldada.</p>
              )}
              <div className="flex gap-2 justify-center">
                {mode === 'split' && remainingAfter > 0.01 && (
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="!w-auto"
                    onClick={() => {
                      setPaidNow(null);
                      setAmount('');
                      setDiscountPercent('');
                      setReferenceNumber('');
                      setProofUrl(null);
                      setProofError(null);
                      setPickedQty({});
                    }}
                  >
                    Seguir pagando fraccionado
                  </TextureButton>
                )}
                <TextureButton variant="secondary" size="default" className="!w-auto" onClick={onClose}>
                  {remainingAfter > 0.01 ? 'Cerrar por ahora' : 'Cerrar'}
                </TextureButton>
              </div>
            </div>
          ) : (
            <>
              {mode === 'split' && (
                <div className="flex gap-1.5">
                  {(['amount', 'items'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSplitBy(s)}
                      className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                        splitBy === s ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                      }`}
                    >
                      {s === 'amount' ? 'Por monto' : 'Por ítems'}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-brand-950/50 mb-1.5">Método de pago</p>
                <div className="flex flex-wrap gap-1.5">
                  {paymentOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => setMethod(o)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        method === o ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                      }`}
                    >
                      {PAYMENT_LABELS[o]}
                    </button>
                  ))}
                </div>
              </div>

              {method === 'MOBILE_PAYMENT' && (
                <div className="text-center space-y-2">
                  {restaurant?.paymentMethodsConfig?.MOBILE_PAYMENT?.qrImageUrl && (
                    <img
                      src={restaurant.paymentMethodsConfig.MOBILE_PAYMENT.qrImageUrl}
                      alt="QR de Pago Móvil"
                      className="mx-auto w-full max-w-[220px] aspect-square object-contain rounded-2xl border border-brand-950/10"
                    />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-brand-950/50">Monto a cobrar</p>
                    <div className="text-3xl font-extrabold text-emerald-600 leading-none tracking-tight mt-1">
                      {restaurant?.exchangeRate ? formatBs(amountToCharge, restaurant.exchangeRate.rateBs) : formatBase(amountToCharge, symbol)}
                    </div>
                    {restaurant?.exchangeRate && (
                      <p className="text-xs font-medium text-brand-950/50 mt-1.5">
                        {formatBase(amountToCharge, symbol)} &nbsp;x&nbsp; Bs{Number(restaurant.exchangeRate.rateBs).toFixed(2)}{' '}
                        (tasa del día)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedDetails && (
                <div className="text-xs text-brand-950/60 bg-brand-950/[0.03] rounded-lg px-2.5 py-2 space-y-1">
                  {(Object.keys(PAYMENT_FIELD_LABELS) as (keyof typeof PAYMENT_FIELD_LABELS)[])
                    .filter((f) => selectedDetails[f as keyof typeof selectedDetails])
                    .map((f) => {
                      const value = String(selectedDetails[f as keyof typeof selectedDetails]);
                      return (
                        <div key={f} className="flex items-center justify-between gap-2">
                          <p className="truncate">
                            <span className="text-brand-950/40">{PAYMENT_FIELD_LABELS[f]}:</span> {value}
                          </p>
                          <button
                            type="button"
                            onClick={() => copyField(f, value)}
                            aria-label={`Copiar ${PAYMENT_FIELD_LABELS[f]}`}
                            className="shrink-0 flex items-center gap-1 text-brand-500 hover:text-brand-400 font-medium"
                          >
                            {copiedField === f ? (
                              <>
                                <Check className="h-3 w-3" /> Copiado
                              </>
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}

              {needsReference && (
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">{referenceLabel(method)}</p>
                  <input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={referenceLabel(method)}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              )}

              {needsProof && (
                <div className="space-y-1.5">
                  <TextureButton
                    variant="minimal"
                    size="sm"
                    className="w-full justify-center"
                    disabled={uploadingProof}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {uploadingProof ? 'Subiendo…' : proofUrl ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
                  </TextureButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleProofFileChange}
                  />
                  {proofUrl && (
                    <div className="flex items-center gap-2.5 justify-center">
                      <img src={proofUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-brand-950/10" />
                      <p className="text-xs font-semibold text-emerald-600">✓ Comprobante adjunto</p>
                    </div>
                  )}
                  {proofError && <p className="text-xs font-semibold text-red-600">{proofError}</p>}
                </div>
              )}

              {showDiscount && !(mode === 'split' && splitBy === 'items') && (
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descuento (%)</p>
                  <input
                    value={discountPercent}
                    onChange={(e) => onDiscountChange(e.target.value)}
                    placeholder="0"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              )}

              {mode === 'split' && splitBy === 'items' ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-brand-950/50">Elige qué ítems cobra esta persona</p>
                  <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                    {order.items.map((it) => {
                      const remaining = remainingQty(it);
                      const qty = pickedQty[it.id] ?? 0;
                      if (remaining === 0) return null;
                      return (
                        <li
                          key={it.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-sm ${
                            qty > 0 ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                          }`}
                        >
                          <span className="min-w-0 truncate">
                            {it.productName}
                            {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                            <span className="text-brand-950/40"> · quedan {remaining}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => stepItem(it.id, -1, remaining)}
                              disabled={qty === 0}
                              className="w-6 h-6 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-medium">{qty}</span>
                            <button
                              type="button"
                              onClick={() => stepItem(it.id, 1, remaining)}
                              disabled={qty >= remaining}
                              className="w-6 h-6 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex items-center justify-between text-sm font-semibold pt-1">
                    <span>Monto a cobrar</span>
                    <span>{formatBase(itemsSubtotal, symbol)}</span>
                  </div>
                </div>
              ) : mode === 'split' ? (
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">Monto a abonar</p>
                  <input
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder={`Máx. ${balanceBase.toFixed(2)}`}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              ) : (
                <div className="space-y-1 pt-1">
                  {discountPct > 0 && (
                    <div className="flex items-center justify-between text-xs text-brand-950/50">
                      <span>Descuento aplicado</span>
                      <span>-{formatBase(round2(balanceBase - discountedBalance), symbol)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Monto a cobrar</span>
                    <span>{formatBase(discountedBalance, symbol)}</span>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <TextureButton variant="brand" size="default" disabled={sending} onClick={submit} className="disabled:opacity-50">
                {sending ? 'Registrando…' : 'Registrar pago'}
              </TextureButton>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
