import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import type { PaymentMethod } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { LiveOrder } from './LiveOrdersPanel';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

const DEFAULT_PAYMENT_OPTIONS: PaymentMethod[] = ['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD'];

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
  onPaid: () => void;
}

/** "Pagar" / "Pago Fraccionado": selecciona método, muestra sus datos de cobro y registra el pago del pedido. */
export function PaymentDialog({ order, mode, onClose, onPaid }: Props) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';

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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [printing, setPrinting] = useState(false);

  const selectedDetails = paymentConfig?.[method];
  const discountPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountedBalance = round2(balanceBase * (1 - discountPct / 100));

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

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

  async function submit() {
    const amountBase = mode === 'split' ? Number(amount) : discountedBalance;
    if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    if (amountBase > balanceBase + 0.01) {
      setError(`El monto no puede superar el saldo pendiente (${formatBase(balanceBase, symbol)}).`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/payments`, {
        amountBase,
        method,
        discountPercent: discountPct > 0 ? discountPct : undefined,
      });
      onPaid();
      const remaining = balanceBase - amountBase;
      if (mode === 'full' || remaining <= 0.01) {
        setShowPrintPrompt(true);
      } else {
        setPaidNow(amountBase);
        setAmount('');
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'full' ? 'Pagar' : 'Pago fraccionado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm bg-brand-950/[0.03] rounded-xl px-3 py-2.5">
            <span className="text-brand-950/60">Total del pedido</span>
            <span className="font-semibold text-brand-950">{formatBase(order.totalBase, symbol)}</span>
          </div>
          {paidBase > 0 && (
            <div className="flex items-center justify-between text-sm bg-brand-950/[0.03] rounded-xl px-3 py-2.5 -mt-2">
              <span className="text-brand-950/60">Ya pagado</span>
              <span className="font-medium text-emerald-600">{formatBase(paidBase, symbol)}</span>
            </div>
          )}

          {showPrintPrompt ? (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium text-emerald-600">✓ Cuenta saldada</p>
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

              <div>
                <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descuento (%)</p>
                <input
                  value={discountPercent}
                  onChange={(e) => onDiscountChange(e.target.value)}
                  placeholder="0"
                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                />
              </div>

              {mode === 'split' ? (
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
