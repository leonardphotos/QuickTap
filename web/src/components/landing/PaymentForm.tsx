import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Bitcoin, Copy, CreditCard, Landmark, Loader2, Paperclip, Tag, Wallet, X } from 'lucide-react';
import { api } from '@/api/client';
import { formatBs } from '@/utils/format';
import {
  paymentMethodLines,
  PAYMENT_METHOD_LABEL,
  type BillingCycle,
  type PlanId,
  type PlatformPaymentMethods,
  type SubscriptionPaymentMethod,
} from '@/utils/plans';
import { PLAN_CONTENT } from './PlanCards';
import { TextureButton } from '@/components/ui/texture-button';
import { useCopyToast } from '@/hooks/useCopyToast';
import { Toast } from '@/components/ui/toast';

export interface SelectedPlan {
  plan: Exclude<PlanId, 'TRIAL'>;
  billingCycle: BillingCycle;
  priceUsd: number;
  customTables?: number;
  customUsers?: number;
  customOrders?: number;
  customAddons?: {
    administration?: boolean;
    inventoryBasic?: boolean;
    inventoryRecipe?: boolean;
    accountsPayable?: boolean;
  };
}

interface InstallmentPayment {
  id: string;
  amountUsd: string;
  paymentMethod: SubscriptionPaymentMethod;
  paymentReference: string;
  proofImageUrl: string;
  createdAt: string;
}

interface InstallmentRequest {
  id: string;
  priceUsd: string;
  payments: InstallmentPayment[];
}

const PAYMENT_METHODS: SubscriptionPaymentMethod[] = ['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER'];
const PAYMENT_METHOD_ICON: Record<SubscriptionPaymentMethod, typeof Wallet> = {
  PAGO_MOVIL: Wallet,
  BINANCE: Bitcoin,
  BANK_TRANSFER: Landmark,
};

interface Props {
  selected: SelectedPlan;
  rateBs: string | null;
  onCancel: () => void;
  /** Endpoint donde se envía el FormData: público (inscripción) o autenticado (mensualidad). */
  submitUrl: string;
  /** Si viene, se manda como Bearer (flujo autenticado del panel). */
  authToken?: string;
  prefillName?: string;
  prefillEmail?: string;
  /** Qué mostrar tras un envío exitoso. */
  renderSuccess: (message: string) => ReactNode;
}

export function PaymentForm({
  selected,
  rateBs,
  onCancel,
  submitUrl,
  authToken,
  prefillName,
  prefillEmail,
  renderSuccess,
}: Props) {
  const planName = PLAN_CONTENT.find((p) => p.id === selected.plan)?.name ?? 'Plan Personalizado';
  const { copy, toastMessage } = useCopyToast();
  const [methods, setMethods] = useState<PlatformPaymentMethods>({});
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('PAGO_MOVIL');
  // Ramblay (C2P/Binance Pay, activación automática) es la opción por
  // defecto; "manual" es el flujo de siempre (transferencia/Zelle con
  // número de referencia, revisado a mano por el equipo de QuickTap). El
  // Dashboard maestro puede apagar cualquiera de las dos globalmente.
  const [payWith, setPayWith] = useState<'ramblay' | 'manual'>('ramblay');
  const ramblayEnabled = methods.ramblayEnabled ?? true;
  const manualPaymentEnabled = methods.manualPaymentEnabled ?? true;
  const [contactName, setContactName] = useState(prefillName ?? '');
  const [contactEmail, setContactEmail] = useState(prefillEmail ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  // "Pago único" (de siempre) vs "Pago fraccionado": solo tiene sentido para el restaurante ya
  // autenticado pagando su mensualidad (authToken presente) — la inscripción pública sigue el
  // flujo de siempre, un solo comprobante.
  const [payMode, setPayMode] = useState<'single' | 'installment'>('single');
  const [installment, setInstallment] = useState<InstallmentRequest | null>(null);
  const [startingInstallment, setStartingInstallment] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentProof, setInstallmentProof] = useState<File | null>(null);
  const [addingPayment, setAddingPayment] = useState(false);
  const [installmentError, setInstallmentError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/public/payment-methods')
      .then((res) => {
        const data: PlatformPaymentMethods = res.data.data ?? {};
        setMethods(data);
        // Si Ramblay (la opción por defecto) está apagado, cae al manual automáticamente.
        if (data.ramblayEnabled === false && data.manualPaymentEnabled !== false) setPayWith('manual');
      })
      .catch(() => setMethods({}));
  }, []);

  const authHeaders = authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined;

  // Retoma el pago fraccionado pendiente (si el restaurante ya había empezado uno) en vez de
  // obligarlo a empezar de cero cada vez que vuelve a esta pantalla.
  useEffect(() => {
    if (!authToken) return;
    api
      .get(`${submitUrl}/installment/pending`, authHeaders)
      .then((res) => {
        if (res.data.data) setInstallment(res.data.data);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  async function startInstallment() {
    if (!contactName.trim() || !contactEmail.trim()) {
      setInstallmentError('Escribe tu nombre y correo para continuar.');
      return;
    }
    setStartingInstallment(true);
    setInstallmentError(null);
    try {
      const { data } = await api.post(
        `${submitUrl}/installment`,
        {
          plan: selected.plan,
          billingCycle: selected.billingCycle,
          ...(promo ? { promoCode: promo.code } : {}),
          contactName,
          contactEmail,
          ...(contactPhone ? { contactPhone } : {}),
        },
        authHeaders,
      );
      setInstallment(data.data);
      setInstallmentAmount('');
    } catch (err: any) {
      setInstallmentError(err.response?.data?.error ?? 'No se pudo iniciar el pago fraccionado.');
    } finally {
      setStartingInstallment(false);
    }
  }

  async function addInstallmentPayment() {
    if (!installment) return;
    const amount = Number(installmentAmount);
    if (!amount || amount <= 0) {
      setInstallmentError('Escribe el monto que vas a abonar.');
      return;
    }
    if (!paymentReference.trim()) {
      setInstallmentError('Escribe el número de referencia de este abono.');
      return;
    }
    if (!installmentProof) {
      setInstallmentError('Sube el comprobante de este abono.');
      return;
    }
    setAddingPayment(true);
    setInstallmentError(null);
    try {
      const form = new FormData();
      form.append('amountUsd', String(amount));
      form.append('paymentMethod', method);
      form.append('paymentReference', paymentReference.trim());
      form.append('photo', installmentProof);
      await api.post(`${submitUrl}/${installment.id}/payments`, form, {
        headers: { ...(authHeaders?.headers ?? {}), 'Content-Type': 'multipart/form-data' },
      });
      const { data } = await api.get(`${submitUrl}/installment/pending`, authHeaders);
      setInstallment(data.data);
      setInstallmentAmount('');
      setPaymentReference('');
      setInstallmentProof(null);
    } catch (err: any) {
      setInstallmentError(err.response?.data?.error ?? 'No se pudo registrar el abono.');
    } finally {
      setAddingPayment(false);
    }
  }

  const installmentPaidUsd = installment ? installment.payments.reduce((a, p) => a + Number(p.amountUsd), 0) : 0;
  const installmentRemainingUsd = installment ? Math.max(0, Number(installment.priceUsd) - installmentPaidUsd) : 0;

  const finalPriceUsd = promo
    ? Math.round(selected.priceUsd * (1 - promo.discountPercent / 100) * 100) / 100
    : selected.priceUsd;

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setCheckingPromo(true);
    setPromoError(null);
    try {
      const { data } = await api.get(`/public/promo-codes/${encodeURIComponent(promoInput.trim())}`);
      setPromo(data.data);
    } catch (err: any) {
      setPromo(null);
      setPromoError(err.response?.data?.error ?? 'Código inválido.');
    } finally {
      setCheckingPromo(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // El "pago fraccionado" no usa este submit — cada abono se envía con su propio botón
    // (addInstallmentPayment) para no mezclar su validación con la del pago único.
    if (payWith === 'manual' && authToken && payMode === 'installment') return;
    if (payWith === 'ramblay') {
      await payWithRamblay();
      return;
    }
    if (!paymentReference.trim()) {
      setError('Escribe el número de referencia del pago.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        submitUrl,
        {
          plan: selected.plan,
          billingCycle: selected.billingCycle,
          paymentMethod: method,
          paymentReference: paymentReference.trim(),
          ...(selected.plan === 'CUSTOM'
            ? {
                customTables: selected.customTables ?? 0,
                customUsers: selected.customUsers ?? 0,
                customOrders: selected.customOrders ?? 0,
                customAdministration: !!selected.customAddons?.administration,
                customInventoryBasic: !!selected.customAddons?.inventoryBasic,
                customInventoryRecipe: !!selected.customAddons?.inventoryRecipe,
                customAccountsPayable: !!selected.customAddons?.accountsPayable,
              }
            : {}),
          ...(promo ? { promoCode: promo.code } : {}),
          contactName,
          contactEmail,
          ...(contactPhone ? { contactPhone } : {}),
          ...(restaurantName ? { restaurantName } : {}),
        },
        authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined,
      );
      setSuccessMessage('En máximo 10 minutos tu plan estará activo.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  async function payWithRamblay() {
    if (!contactName.trim() || !contactEmail.trim()) {
      setError('Escribe tu nombre y correo para continuar.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(
        `${submitUrl}/ramblay-checkout`,
        {
          plan: selected.plan,
          billingCycle: selected.billingCycle,
          ...(promo ? { promoCode: promo.code } : {}),
          contactName,
          contactEmail,
          ...(contactPhone ? { contactPhone } : {}),
          ...(restaurantName ? { restaurantName } : {}),
        },
        authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined,
      );
      window.location.href = data.data.checkoutUrl;
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar el pago con Ramblay.');
      setSubmitting(false);
    }
  }

  if (successMessage) {
    return <>{renderSuccess(successMessage)}</>;
  }

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-6 sm:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-brand-950/50 font-light">Estás eligiendo</p>
          <p className="text-lg font-semibold text-brand-950">
            {planName} ·{' '}
            {promo ? (
              <>
                <span className="line-through text-brand-950/40">${selected.priceUsd.toFixed(2)}</span>{' '}
                <span className="text-brand-500">${finalPriceUsd.toFixed(2)}/mes</span>
              </>
            ) : (
              <>${selected.priceUsd.toFixed(2)}/mes</>
            )}
            {rateBs && (
              <span className="text-sm font-normal text-brand-950/50"> ({formatBs(finalPriceUsd, rateBs)}/mes)</span>
            )}
          </p>
        </div>
        <button onClick={onCancel} className="text-sm text-brand-950/40 hover:text-brand-950 shrink-0">
          Cambiar plan
        </button>
      </div>

      <div className="mb-6">
        <span className="text-sm text-brand-950/70 font-medium">Código de descuento</span>
        {promo ? (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm w-fit">
            <Tag className="h-4 w-4" /> {promo.code} · -{promo.discountPercent}%
            <button
              type="button"
              onClick={() => {
                setPromo(null);
                setPromoInput('');
              }}
              className="text-emerald-700/60 hover:text-emerald-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Ej: LANZAMIENTO20"
              className="border border-brand-950/15 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={checkingPromo || !promoInput.trim()}
              className="text-sm font-medium text-brand-500 disabled:opacity-40"
            >
              {checkingPromo ? 'Validando…' : 'Aplicar'}
            </button>
          </div>
        )}
        {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
      </div>

      {(ramblayEnabled || manualPaymentEnabled) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {ramblayEnabled && (
            <button
              type="button"
              onClick={() => setPayWith('ramblay')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                payWith === 'ramblay' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" /> Pago Automatizado
            </button>
          )}
          {manualPaymentEnabled && (
            <button
              type="button"
              onClick={() => setPayWith('manual')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                payWith === 'manual' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              Pago manual
            </button>
          )}
        </div>
      )}

      {!ramblayEnabled && !manualPaymentEnabled ? (
        <p className="text-sm text-amber-600 font-medium mb-6">
          Los pagos están deshabilitados temporalmente. Contáctanos para activar tu plan.
        </p>
      ) : payWith === 'ramblay' ? (
        <p className="text-sm text-brand-950/60 font-light mb-6">
          Pagas con C2P o Binance Pay en el checkout seguro de Ramblay. En cuanto se confirme, tu plan se activa solo —
          sin esperar revisión manual.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {PAYMENT_METHODS.map((m) => {
              const Icon = PAYMENT_METHOD_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    method === m ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {PAYMENT_METHOD_LABEL[m]}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl bg-brand-950/[0.03] p-4 mb-6 text-sm space-y-1.5">
            {paymentMethodLines(method, methods).map((line) => (
              <div key={line.label} className="flex items-center justify-between gap-2">
                <p className="text-brand-950/70">
                  <span className="text-brand-950/50">{line.label}: </span>
                  {line.value}
                </p>
                {line.copyable && (
                  <button
                    type="button"
                    onClick={() => copy(line.value, `${line.label} copiado`)}
                    aria-label={`Copiar ${line.label}`}
                    className="shrink-0 text-brand-950/40 hover:text-brand-500 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={`space-y-4 ${!ramblayEnabled && !manualPaymentEnabled ? 'hidden' : ''}`}>
        {payWith === 'manual' && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre" value={contactName} onChange={setContactName} required />
              <Field label="Correo" type="email" value={contactEmail} onChange={setContactEmail} required />
              <Field label="Teléfono" value={contactPhone} onChange={setContactPhone} placeholder="584141234567" />
              {!authToken && <Field label="Nombre del restaurante" value={restaurantName} onChange={setRestaurantName} />}
            </div>

            {authToken && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPayMode('single')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    payMode === 'single' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  Pago único
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('installment')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    payMode === 'installment' ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  Pago fraccionado
                </button>
              </div>
            )}

            {payMode === 'single' || !authToken ? (
              <Field
                label="Número de referencia del pago"
                value={paymentReference}
                onChange={setPaymentReference}
                placeholder="Ej: 004215778901"
                required
              />
            ) : !installment ? (
              <div className="rounded-xl bg-brand-950/[0.03] p-4 space-y-3">
                <p className="text-sm text-brand-950/60 font-light">
                  Abona el monto que puedas ahora y sigue completando el resto con más abonos, cada uno con su propio
                  comprobante, hasta cubrir el total.
                </p>
                {installmentError && <p className="text-sm text-red-600">{installmentError}</p>}
                <TextureButton
                  type="button"
                  variant="brand"
                  size="sm"
                  disabled={startingInstallment}
                  className="!w-auto disabled:opacity-50"
                  onClick={startInstallment}
                >
                  {startingInstallment ? 'Iniciando…' : 'Iniciar pago fraccionado'}
                </TextureButton>
              </div>
            ) : (
              <div className="rounded-xl bg-brand-950/[0.03] p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-brand-950/70">
                      Pagado: <span className="font-semibold text-brand-950">${installmentPaidUsd.toFixed(2)}</span> de $
                      {Number(installment.priceUsd).toFixed(2)}
                    </span>
                    {installmentRemainingUsd > 0 && (
                      <span className="text-brand-950/50">Faltan ${installmentRemainingUsd.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-brand-950/10 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all"
                      style={{
                        width: `${Math.min(100, (installmentPaidUsd / Number(installment.priceUsd)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {installment.payments.length > 0 && (
                  <div className="rounded-lg border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                    {installment.payments.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-brand-950/70">
                          Abono {i + 1} · {PAYMENT_METHOD_LABEL[p.paymentMethod]} · Ref. {p.paymentReference}
                        </span>
                        <span className="font-semibold text-brand-950 shrink-0">${Number(p.amountUsd).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {installmentRemainingUsd > 0 ? (
                  <div className="space-y-3 pt-1 border-t border-brand-950/[0.06]">
                    <p className="text-sm font-medium text-brand-950/70">Registrar un abono</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field
                        label="Monto a abonar (USD)"
                        type="number"
                        value={installmentAmount}
                        onChange={setInstallmentAmount}
                        placeholder={installmentRemainingUsd.toFixed(2)}
                      />
                      <Field
                        label="Número de referencia"
                        value={paymentReference}
                        onChange={setPaymentReference}
                        placeholder="Ej: 004215778901"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-brand-950/70 cursor-pointer">
                      <Paperclip className="h-4 w-4 shrink-0 text-brand-950/40" />
                      <span className="truncate">{installmentProof ? installmentProof.name : 'Subir comprobante de este abono'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setInstallmentProof(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {installmentError && <p className="text-sm text-red-600">{installmentError}</p>}
                    <TextureButton
                      type="button"
                      variant="brand"
                      size="sm"
                      disabled={addingPayment}
                      className="!w-auto disabled:opacity-50 flex items-center gap-2"
                      onClick={addInstallmentPayment}
                    >
                      {addingPayment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {addingPayment ? 'Guardando…' : 'Agregar abono'}
                    </TextureButton>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-600 font-medium pt-1 border-t border-brand-950/[0.06]">
                    ¡Cubriste el total! En cuanto lo confirmemos, activaremos tu cuenta.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!(payWith === 'manual' && authToken && payMode === 'installment') && (
          <TextureButton
            variant="brand"
            size="default"
            disabled={submitting}
            className="!w-auto disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? payWith === 'ramblay'
                ? 'Abriendo Ramblay…'
                : 'Enviando…'
              : payWith === 'ramblay'
                ? 'Pagar con Ramblay'
                : 'Pagar'}
          </TextureButton>
        )}
      </form>
      <Toast message={toastMessage} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-brand-950/70">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
      />
    </label>
  );
}
