import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, Camera, Check, Copy, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase, formatBs, formatBsAbsolute } from '@/utils/format';
import type { PaymentMethod } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { clubApi, type ClubBooking, type ClubBookingPayment } from './clubApi';

// Mismas etiquetas y reglas que el cobro de comandas (PaymentDialog.tsx) — es
// literalmente "la misma pasarela de pago de restaurantes" que se pidió.
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
const METHODS_REQUIRING_REFERENCE: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];
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

function PaymentRow({ payment, symbol }: { payment: ClubBookingPayment; symbol: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-brand-950/[0.06] py-1.5 text-xs last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-brand-950">{PAYMENT_LABELS[payment.method] ?? payment.method}</p>
        {payment.referenceNumber && (
          <p className="truncate text-brand-950/40">
            Ref: {payment.referenceNumber}
            {payment.proofImageUrl && <span className="text-emerald-600"> · ✓ Comprobante</span>}
          </p>
        )}
      </div>
      <p className="shrink-0 font-semibold text-brand-950">{formatBase(payment.amountBase, symbol)}</p>
    </div>
  );
}

interface Props {
  booking: ClubBooking;
  mode: 'full' | 'split';
  onClose: () => void;
  onPaid: (updated: ClubBooking) => void;
}

/** "Pagar" / "Pago Fraccionado" de la Caja de canchas — mismo componente y misma
 * lógica que PaymentDialog.tsx, sin ítems ni descuento: una reserva es una sola línea. */
export function ClubPaymentDialog({ booking, mode, onClose, onPaid }: Props) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

  const balanceBase = Number(booking.balanceBase);
  const paidBase = Number(booking.paidBase);

  const paymentConfig = restaurant?.paymentMethodsConfig;
  const hasPaymentConfig = paymentConfig && Object.values(paymentConfig).some((m) => m?.enabled);
  const paymentOptions = hasPaymentConfig
    ? (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter((k) => paymentConfig?.[k]?.enabled)
    : DEFAULT_PAYMENT_OPTIONS;

  const [method, setMethod] = useState<PaymentMethod>(paymentOptions[0] ?? 'CASH');
  const [amount, setAmount] = useState(mode === 'split' ? '' : balanceBase.toFixed(2));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [latestBooking, setLatestBooking] = useState(booking);

  const selectedDetails = paymentConfig?.[method];
  const needsReference = METHODS_REQUIRING_REFERENCE.includes(method);
  const needsProof = METHODS_REQUIRING_PROOF.includes(method);
  const amountToCharge = mode === 'split' ? Number(amount) || 0 : balanceBase;

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
      const url = await clubApi.uploadPaymentProof(file);
      setProofUrl(url);
    } catch (err: any) {
      setProofError(err.response?.data?.error ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingProof(false);
    }
  }

  async function submit() {
    const amountBase = mode === 'split' ? Number(amount) : balanceBase;
    if (!amountBase || amountBase <= 0) {
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
    setSending(true);
    setError(null);
    try {
      const updated = await clubApi.addBookingPayment(booking.id, {
        amountBase,
        method,
        referenceNumber: needsReference ? referenceNumber.trim() : undefined,
        proofImageUrl: needsProof ? proofUrl ?? undefined : undefined,
      });
      setLatestBooking(updated);
      onPaid(updated);
      setPaidNow(amountBase);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
    } finally {
      setSending(false);
    }
  }

  const remainingAfter = paidNow != null ? Number(latestBooking.balanceBase) : balanceBase;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader className={paidNow != null ? undefined : 'flex-row items-center gap-2 pr-6'}>
          {paidNow == null && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-950/[0.06] hover:bg-brand-950/10 focus:outline-none"
            >
              <ArrowLeft className="h-4 w-4 text-brand-950/70" />
            </button>
          )}
          <DialogTitle>{mode === 'full' ? 'Pagar' : 'Pago fraccionado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1 rounded-xl bg-brand-950/[0.03] px-3 py-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-950/60">{booking.block?.court.name ?? 'Cancha'}</span>
              <span className="font-semibold text-brand-950">{formatBase(booking.totalBase, symbol)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-950/40">Equivalente</span>
              <span className="text-brand-950/50">{formatBsAbsolute(booking.totalBs)}</span>
            </div>
          </div>

          {paidBase > 0 && (
            <div className="-mt-2 flex items-center justify-between rounded-xl bg-brand-950/[0.03] px-3 py-2.5 text-sm">
              <span className="text-brand-950/60">Ya pagado</span>
              <span className="font-medium text-emerald-600">{formatBase(paidBase, symbol)}</span>
            </div>
          )}

          {paidNow != null ? (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm font-medium text-emerald-600">✓ Pago de {formatBase(paidNow, symbol)} registrado</p>
              {latestBooking.payments && latestBooking.payments.length > 0 && (
                <div className="rounded-xl border border-brand-950/10 px-3 py-2 text-left">
                  {latestBooking.payments.map((p) => (
                    <PaymentRow key={p.id} payment={p} symbol={symbol} />
                  ))}
                </div>
              )}
              {remainingAfter > 0.01 ? (
                <p className="text-sm text-brand-950/60">
                  Aún debe <span className="font-semibold text-brand-950">{formatBase(remainingAfter, symbol)}</span>
                </p>
              ) : (
                <p className="text-sm text-brand-950/60">Reserva saldada.</p>
              )}
              <div className="flex justify-center gap-2">
                {mode === 'split' && remainingAfter > 0.01 && (
                  <TextureButton
                    variant="brand"
                    size="default"
                    className="!w-auto"
                    onClick={() => {
                      setPaidNow(null);
                      setAmount('');
                      setReferenceNumber('');
                      setProofUrl(null);
                      setProofError(null);
                    }}
                  >
                    Seguir cobrando
                  </TextureButton>
                )}
                <TextureButton variant="secondary" size="default" className="!w-auto" onClick={onClose}>
                  Cerrar
                </TextureButton>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-brand-950/50">Método de pago</p>
                <div className="flex flex-wrap gap-1.5">
                  {paymentOptions.map((o) => (
                    <button
                      key={o}
                      onClick={() => setMethod(o)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        method === o ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                      }`}
                    >
                      {PAYMENT_LABELS[o]}
                    </button>
                  ))}
                </div>
              </div>

              {method === 'MOBILE_PAYMENT' && (
                <div className="space-y-2 text-center">
                  {restaurant?.paymentMethodsConfig?.MOBILE_PAYMENT?.qrImageUrl && (
                    <img
                      src={restaurant.paymentMethodsConfig.MOBILE_PAYMENT.qrImageUrl}
                      alt="QR de Pago Móvil"
                      className="mx-auto aspect-square w-full max-w-[220px] rounded-2xl border border-brand-950/10 object-contain"
                    />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-brand-950/50">Monto a cobrar</p>
                    <div className="mt-1 text-3xl font-extrabold leading-none tracking-tight text-emerald-600">
                      {restaurant?.exchangeRate
                        ? formatBs(amountToCharge, restaurant.exchangeRate.rateBs)
                        : formatBase(amountToCharge, symbol)}
                    </div>
                    {restaurant?.exchangeRate && (
                      <p className="mt-1.5 text-xs font-medium text-brand-950/50">
                        {formatBase(amountToCharge, symbol)} &nbsp;x&nbsp; Bs{Number(restaurant.exchangeRate.rateBs).toFixed(2)}{' '}
                        (tasa del día)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedDetails && (
                <div className="space-y-1 rounded-lg bg-brand-950/[0.03] px-2.5 py-2 text-xs text-brand-950/60">
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
                            className="flex shrink-0 items-center gap-1 font-medium text-brand-500 hover:text-brand-400"
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
                  <p className="mb-1.5 text-xs font-medium text-brand-950/50">{referenceLabel(method)}</p>
                  <input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={referenceLabel(method)}
                    className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
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
                    {uploadingProof ? 'Subiendo…' : proofUrl ? 'Cambiar comprobante' : 'Adjuntar comprobante (opcional)'}
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
                    <div className="flex items-center justify-center gap-2.5">
                      <img src={proofUrl} alt="Comprobante" className="h-12 w-12 rounded-lg border border-brand-950/10 object-cover" />
                      <p className="text-xs font-semibold text-emerald-600">✓ Comprobante adjunto</p>
                    </div>
                  )}
                  {proofError && <p className="text-xs font-semibold text-red-600">{proofError}</p>}
                </div>
              )}

              {mode === 'split' ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-brand-950/50">Monto a abonar</p>
                  <input
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder={`Máx. ${balanceBase.toFixed(2)}`}
                    className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1 text-sm font-semibold">
                  <span>Monto a cobrar</span>
                  <span>{formatBase(balanceBase, symbol)}</span>
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
