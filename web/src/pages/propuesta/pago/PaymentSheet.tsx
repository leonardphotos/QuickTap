import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, ChevronLeft, Coins, CreditCard, Landmark, Printer, Send, Smartphone, Trash2, type LucideIcon } from 'lucide-react';
import { BCV_RATE } from '../dashboard/data';
import { formatBs, formatUsd } from '../dashboard/format';
import type { ProposalOrder } from '../pedidos/data';

type Currency = 'USD' | 'BS';
type MethodId = 'CASH_USD' | 'CASH_BS' | 'PAGO_MOVIL' | 'POS' | 'ZELLE' | 'TRANSFER';

interface PaymentMethod {
  id: MethodId;
  label: string;
  icon: LucideIcon;
  currency: Currency;
  cash?: boolean;
  referenceLabel?: string;
}

const METHODS: PaymentMethod[] = [
  { id: 'CASH_USD', label: 'Efectivo $', icon: Banknote, currency: 'USD', cash: true },
  { id: 'CASH_BS', label: 'Efectivo Bs', icon: Coins, currency: 'BS', cash: true },
  { id: 'PAGO_MOVIL', label: 'Pago móvil', icon: Smartphone, currency: 'BS', referenceLabel: 'Referencia del pago móvil' },
  { id: 'POS', label: 'Punto de venta', icon: CreditCard, currency: 'BS', referenceLabel: 'Número de lote o aprobación' },
  { id: 'ZELLE', label: 'Zelle', icon: Send, currency: 'USD', referenceLabel: 'Correo o código de confirmación' },
  { id: 'TRANSFER', label: 'Transferencia', icon: Landmark, currency: 'BS', referenceLabel: 'Referencia bancaria' },
];

const TIP_OPTIONS = [
  { id: 'none', label: 'Sin propina', rate: 0 },
  { id: '10', label: '10%', rate: 0.1 },
  { id: '15', label: '15%', rate: 0.15 },
  { id: 'custom', label: 'Otra', rate: 0 },
] as const;
type TipId = (typeof TIP_OPTIONS)[number]['id'];

export interface PaymentLine {
  key: string;
  name: string;
  quantity: number;
  amount: number;
}

interface RegisteredPayment {
  id: string;
  method: PaymentMethod;
  amountUsd: number;
  reference?: string;
}

interface PaymentSheetProps {
  order: ProposalOrder;
  lines: PaymentLine[];
  delivery?: number;
  alreadyPaid?: number;
  onClose: () => void;
  onFinish: () => void;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const toCurrency = (usd: number, currency: Currency) => (currency === 'BS' ? usd * BCV_RATE : usd);
const toUsd = (value: number, currency: Currency) => (currency === 'BS' ? value / BCV_RATE : value);
const parseAmount = (value: string) => Number.parseFloat(value.replace(',', '.'));
const formatIn = (usd: number, currency: Currency) => (currency === 'BS' ? formatBs(usd) : formatUsd(usd));

/**
 * Propuesta de rediseño del cobro (PaymentDialog). Una sola pantalla: la cuenta a la izquierda y
 * el cobro a la derecha. Cada abono llena el medidor de saldo hasta cerrar el pedido, así el pago
 * fraccionado no es un modo aparte sino registrar varios abonos.
 */
export function PaymentSheet({ order, lines, delivery = 0, alreadyPaid = 0, onClose, onFinish }: PaymentSheetProps) {
  const [method, setMethod] = useState<PaymentMethod>(METHODS[0]);
  const [split, setSplit] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [receivedInput, setReceivedInput] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [tipId, setTipId] = useState<TipId>('none');
  const [customTip, setCustomTip] = useState('');
  const [fiscal, setFiscal] = useState(false);
  const [rif, setRif] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [payments, setPayments] = useState<RegisteredPayment[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const subtotal = useMemo(() => r2(lines.reduce((s, l) => s + l.amount, 0)), [lines]);
  const tip = tipId === 'custom' ? Math.max(0, r2(parseAmount(customTip) || 0)) : r2(subtotal * (TIP_OPTIONS.find((t) => t.id === tipId)?.rate ?? 0));
  const total = r2(subtotal + delivery + tip);
  const registered = r2(payments.reduce((s, p) => s + p.amountUsd, 0));
  const covered = r2(alreadyPaid + registered);
  const remaining = Math.max(0, r2(total - covered));
  const progress = total > 0 ? Math.min(1, covered / total) : 0;

  const typedAmount = parseAmount(amountInput);
  const rawAmountUsd = split && amountInput !== '' ? r2(toUsd(typedAmount, method.currency)) : remaining;
  const amountUsd = Math.abs(rawAmountUsd - remaining) < 0.01 ? remaining : rawAmountUsd;
  const amountInCurrency = r2(toCurrency(amountUsd, method.currency));

  const received = parseAmount(receivedInput);
  const change = method.cash && receivedInput !== '' && received > amountInCurrency ? r2(received - amountInCurrency) : 0;

  const amountError = split && amountInput !== '' && (!(typedAmount > 0) || amountUsd > remaining + 0.005) ? `El abono no puede superar ${formatIn(remaining, method.currency)}` : null;
  const receivedError = method.cash && receivedInput !== '' && received < amountInCurrency ? 'Lo recibido es menor que el monto a cobrar' : null;
  const needsReference = Boolean(method.referenceLabel);
  const fiscalIncomplete = fiscal && (rif.trim().length < 6 || businessName.trim().length < 2);
  const closesOrder = amountUsd >= remaining;

  const canSubmit =
    remaining > 0 &&
    amountUsd > 0 &&
    !amountError &&
    !receivedError &&
    (!needsReference || (reference.trim().length >= 4 && confirmed)) &&
    (!closesOrder || !fiscalIncomplete);

  const selectMethod = (next: PaymentMethod) => {
    setMethod(next);
    setAmountInput('');
    setReceivedInput('');
    setReference('');
    setConfirmed(false);
  };

  const submit = () => {
    if (!canSubmit) return;
    setPayments((prev) => [...prev, { id: `p${prev.length + 1}`, method, amountUsd, reference: reference.trim() || undefined }]);
    if (closesOrder) setDone(true);
    selectMethod(method);
  };

  const quickCash = method.currency === 'USD' ? [5, 10, 20, 50, 100] : [500, 1000, 2000, 5000];

  if (done) {
    return (
      <SheetFrame order={order} onClose={onClose} title="Cobro completado">
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
          <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check aria-hidden="true" className="h-8 w-8" strokeWidth={2.5} />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-brand-950">Pedido {order.id} cobrado</h2>
              <p className="text-sm text-muted-foreground">{formatUsd(total)} · {formatBs(total)} · {fiscal ? 'Factura fiscal' : 'Nota de entrega'}</p>
            </div>
            <ul className="flex w-full flex-col divide-y divide-border rounded-2xl border border-border bg-card text-left">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <p.method.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-950">{p.method.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-brand-950">{formatIn(p.amountUsd, p.method.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="grid w-full grid-cols-2 gap-2">
              <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-brand-950 transition-colors hover:bg-muted">
                <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir recibo
              </button>
              <button type="button" onClick={onFinish} className="flex min-h-12 items-center justify-center rounded-xl bg-brand-950 text-sm font-semibold text-white transition-[filter] hover:brightness-110">
                Volver a pedidos
              </button>
            </div>
          </div>
        </div>
      </SheetFrame>
    );
  }

  return (
    <SheetFrame order={order} onClose={onClose} title={`Cobrar pedido ${order.id}`}>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside aria-label="Cuenta" className="flex shrink-0 flex-col border-b border-border bg-card lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Saldo pendiente</span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatUsd(covered)} de {formatUsd(total)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums text-brand-950">{formatUsd(remaining)}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{formatBs(remaining)}</span>
            </div>
            <div role="progressbar" aria-label="Saldo cubierto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {alreadyPaid > 0 && <span className="h-full bg-emerald-500/50" style={{ width: `${(alreadyPaid / total) * 100}%` }} />}
              {payments.map((p) => (
                <span key={p.id} className="h-full border-l-2 border-card bg-emerald-500 transition-[width] duration-500 ease-out first:border-l-0" style={{ width: `${(p.amountUsd / total) * 100}%` }} />
              ))}
            </div>
            {(alreadyPaid > 0 || payments.length > 0) && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {alreadyPaid > 0 && (
                  <li className="flex items-center justify-between text-muted-foreground">
                    <span>Abonos anteriores</span>
                    <span className="tabular-nums">{formatUsd(alreadyPaid)}</span>
                  </li>
                )}
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <p.method.icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate text-brand-950">{p.method.label}{p.reference ? ` · ${p.reference}` : ''}</span>
                    <span className="tabular-nums font-medium text-brand-950">{formatIn(p.amountUsd, p.method.currency)}</span>
                    <button type="button" onClick={() => setPayments((prev) => prev.filter((x) => x.id !== p.id))} aria-label={`Quitar abono ${p.method.label}`} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600">
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hidden min-h-0 flex-1 flex-col border-t border-border lg:flex">
            <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
              {lines.map((line) => (
                <li key={line.key} className="flex items-start gap-3 text-sm">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1 text-xs font-semibold tabular-nums text-brand-950">{line.quantity}</span>
                  <span className="min-w-0 flex-1 truncate pt-0.5 text-brand-950">{line.name}</span>
                  <span className="pt-0.5 tabular-nums text-brand-950">{formatUsd(line.amount)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex shrink-0 flex-col gap-1.5 border-t border-border px-5 py-4 text-sm">
              <div className="flex justify-between text-muted-foreground"><dt>Subtotal</dt><dd className="tabular-nums">{formatUsd(subtotal)}</dd></div>
              {delivery > 0 && <div className="flex justify-between text-muted-foreground"><dt>Envío</dt><dd className="tabular-nums">{formatUsd(delivery)}</dd></div>}
              {tip > 0 && <div className="flex justify-between text-muted-foreground"><dt>Propina</dt><dd className="tabular-nums">{formatUsd(tip)}</dd></div>}
              <div className="flex justify-between pt-1 font-semibold text-brand-950"><dt>Total</dt><dd className="tabular-nums">{formatUsd(total)}</dd></div>
            </dl>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-4 py-6 sm:px-6">
              <Section title="Método de pago">
                <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {METHODS.map((m) => {
                    const active = method.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => selectMethod(m)}
                        className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 text-left transition-colors ${active ? 'border-brand-500 bg-brand-500/[0.08] text-brand-950' : 'border-border bg-card text-brand-950 hover:border-brand-950/25'}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-brand-500 text-white' : 'bg-muted text-brand-950'}`}>
                          <m.icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{m.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{m.currency === 'USD' ? 'Dólares' : 'Bolívares'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section
                title="Monto"
                action={
                  <div role="group" aria-label="Forma de cobro" className="flex gap-1 rounded-lg bg-muted p-0.5">
                    {[{ v: false, l: 'Completo' }, { v: true, l: 'Dividir' }].map((o) => (
                      <button key={o.l} type="button" aria-pressed={split === o.v} onClick={() => { setSplit(o.v); setAmountInput(''); }} className={`min-h-8 rounded-md px-3 text-xs font-semibold transition-colors ${split === o.v ? 'bg-card text-brand-950 shadow-sm' : 'text-muted-foreground hover:text-brand-950'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="flex flex-col gap-3">
                  {split ? (
                    <MoneyField
                      id="pay-amount"
                      label="Monto de este abono"
                      currency={method.currency}
                      value={amountInput}
                      placeholder={amountInCurrency.toFixed(2)}
                      onChange={setAmountInput}
                      hint={amountError ?? `Equivale a ${method.currency === 'BS' ? formatUsd(amountUsd) : formatBs(amountUsd)} · quedarán ${formatUsd(Math.max(0, r2(remaining - amountUsd)))}`}
                      error={Boolean(amountError)}
                    />
                  ) : (
                    <div className="flex items-baseline justify-between rounded-2xl border border-border bg-card px-4 py-3.5">
                      <span className="text-sm text-muted-foreground">A cobrar en {method.currency === 'USD' ? 'dólares' : 'bolívares'}</span>
                      <span className="text-xl font-semibold tabular-nums text-brand-950">{formatIn(amountUsd, method.currency)}</span>
                    </div>
                  )}

                  {method.cash && (
                    <div className="flex flex-col gap-2">
                      <MoneyField
                        id="pay-received"
                        label="Recibido del cliente"
                        currency={method.currency}
                        value={receivedInput}
                        placeholder={amountInCurrency.toFixed(2)}
                        onChange={setReceivedInput}
                        hint={receivedError ?? (change > 0 ? undefined : 'Déjalo vacío si el cliente paga exacto')}
                        error={Boolean(receivedError)}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {quickCash.filter((v) => v >= amountInCurrency).slice(0, 4).map((v) => (
                          <button key={v} type="button" onClick={() => setReceivedInput(String(v))} className="min-h-9 rounded-full border border-border bg-card px-3.5 text-xs font-semibold tabular-nums text-brand-950 transition-colors hover:border-brand-950/25">
                            {method.currency === 'USD' ? `$${v}` : `Bs ${v.toLocaleString('es-VE')}`}
                          </button>
                        ))}
                        <button type="button" onClick={() => setReceivedInput(amountInCurrency.toFixed(2))} className="min-h-9 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-brand-950 transition-colors hover:border-brand-950/25">
                          Exacto
                        </button>
                      </div>
                      {change > 0 && (
                        <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
                          <span className="text-sm font-medium">Vuelto a entregar</span>
                          <span className="text-lg font-semibold tabular-nums">{method.currency === 'USD' ? formatUsd(change) : `Bs ${change.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {method.referenceLabel && (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="pay-reference" className="text-sm font-medium text-brand-950">{method.referenceLabel}</label>
                      <input
                        id="pay-reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value.slice(0, 60))}
                        placeholder="Mínimo 4 caracteres"
                        autoComplete="off"
                        className="min-h-12 rounded-xl border border-border bg-card px-4 text-base text-brand-950 outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-500"
                      />
                      <label className="flex items-start gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-sm text-brand-950">
                        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand-500,#05a5f5)]" />
                        <span className="leading-relaxed">Confirmo que el dinero ya ingresó a la cuenta.</span>
                      </label>
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Propina" action={tip > 0 ? <span className="text-xs font-medium tabular-nums text-muted-foreground">+{formatUsd(tip)}</span> : undefined}>
                <div className="flex flex-col gap-2">
                  <div role="radiogroup" aria-label="Propina" className="grid grid-cols-4 gap-1.5">
                    {TIP_OPTIONS.map((t) => (
                      <button key={t.id} type="button" role="radio" aria-checked={tipId === t.id} onClick={() => setTipId(t.id)} className={`min-h-10 rounded-xl border text-xs font-semibold transition-colors sm:text-sm ${tipId === t.id ? 'border-brand-950 bg-brand-950 text-white' : 'border-border bg-card text-brand-950 hover:border-brand-950/25'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {tipId === 'custom' && <MoneyField id="pay-tip" label="Monto de la propina" currency="USD" value={customTip} placeholder="0.00" onChange={setCustomTip} />}
                </div>
              </Section>

              <Section title="Documento">
                <div className="flex flex-col gap-3">
                  <div role="radiogroup" aria-label="Documento" className="grid grid-cols-2 gap-2">
                    {[{ v: false, l: 'Nota de entrega', d: 'Sin datos fiscales' }, { v: true, l: 'Factura fiscal', d: 'Requiere RIF' }].map((o) => (
                      <button key={o.l} type="button" role="radio" aria-checked={fiscal === o.v} onClick={() => setFiscal(o.v)} className={`flex min-h-14 flex-col justify-center rounded-2xl border px-4 text-left transition-colors ${fiscal === o.v ? 'border-brand-500 bg-brand-500/[0.08]' : 'border-border bg-card hover:border-brand-950/25'}`}>
                        <span className="text-sm font-semibold text-brand-950">{o.l}</span>
                        <span className="text-[11px] text-muted-foreground">{o.d}</span>
                      </button>
                    ))}
                  </div>
                  {fiscal && (
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                      <TextField id="pay-rif" label="RIF o cédula" value={rif} placeholder="J-12345678-9" onChange={setRif} />
                      <TextField id="pay-name" label="Razón social" value={businessName} placeholder={order.customer} onChange={setBusinessName} />
                    </div>
                  )}
                </div>
              </Section>
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="truncate text-xs text-muted-foreground">
                  {closesOrder ? 'Cierra la cuenta' : `Quedarán ${formatUsd(Math.max(0, r2(remaining - amountUsd)))} pendientes`}
                  {fiscal && closesOrder && fiscalIncomplete ? ' · completa los datos fiscales' : ''}
                  {needsReference && !confirmed ? ' · confirma el ingreso' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,165,245,0.45)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:flex-none"
              >
                {closesOrder ? 'Confirmar cobro' : 'Registrar abono'} {formatIn(amountUsd, method.currency)}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </SheetFrame>
  );
}

function SheetFrame({ order, title, onClose, children }: { order: ProposalOrder; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="payment-title" className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-4 border-b border-border bg-card px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} aria-label="Volver al pedido" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-brand-950 transition-colors hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 id="payment-title" className="truncate text-lg font-semibold tracking-tight text-brand-950">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{order.customer} · {order.table} · Tasa BCV {BCV_RATE.toLocaleString('es-VE')} Bs</p>
        </div>
      </header>
      {children}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoneyField({ id, label, currency, value, placeholder, onChange, hint, error }: { id: string; label: string; currency: Currency; value: string; placeholder: string; onChange: (v: string) => void; hint?: string; error?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-brand-950">{label}</label>
      <div className={`flex min-h-12 items-center gap-2 rounded-xl border bg-card px-4 transition-colors focus-within:border-brand-500 ${error ? 'border-red-400' : 'border-border'}`}>
        <span className="text-sm font-semibold text-muted-foreground">{currency === 'USD' ? '$' : 'Bs'}</span>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-invalid={error || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-brand-950 outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
      </div>
      {hint && <p id={`${id}-hint`} className={`text-xs ${error ? 'text-red-600' : 'text-muted-foreground'}`}>{hint}</p>}
    </div>
  );
}

function TextField({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-brand-950">{label}</label>
      <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-h-12 rounded-xl border border-border bg-card px-4 text-base text-brand-950 outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-500" />
    </div>
  );
}
