import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Bitcoin, Copy, Landmark, Loader2, Tag, UploadCloud, Wallet, X } from 'lucide-react';
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
  const [contactName, setContactName] = useState(prefillName ?? '');
  const [contactEmail, setContactEmail] = useState(prefillEmail ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
      .then((res) => setMethods(res.data.data ?? {}))
      .catch(() => setMethods({}));
  }, []);

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
    if (!file) {
      setError('Adjunta el comprobante de pago.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('plan', selected.plan);
      form.append('billingCycle', selected.billingCycle);
      form.append('paymentMethod', method);
      if (selected.plan === 'CUSTOM') {
        form.append('customTables', String(selected.customTables ?? 0));
        form.append('customUsers', String(selected.customUsers ?? 0));
        form.append('customOrders', String(selected.customOrders ?? 0));
      }
      if (promo) form.append('promoCode', promo.code);
      form.append('contactName', contactName);
      form.append('contactEmail', contactEmail);
      if (contactPhone) form.append('contactPhone', contactPhone);
      if (restaurantName) form.append('restaurantName', restaurantName);
      form.append('comprobante', file);

      await api.post(submitUrl, form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      setSuccessMessage('¡Solicitud enviada! Verificaremos tu comprobante y activaremos tu cuenta a la brevedad.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar la solicitud.');
    } finally {
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

      <div className="flex flex-wrap gap-2 mb-6">
        {PAYMENT_METHODS.map((m) => {
          const Icon = PAYMENT_METHOD_ICON[m];
          return (
            <button
              key={m}
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

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nombre" value={contactName} onChange={setContactName} required />
          <Field label="Correo" type="email" value={contactEmail} onChange={setContactEmail} required />
          <Field label="Teléfono" value={contactPhone} onChange={setContactPhone} placeholder="584141234567" />
          {!authToken && <Field label="Nombre del restaurante" value={restaurantName} onChange={setRestaurantName} />}
        </div>

        <label className="block text-sm">
          <span className="text-brand-950/70">Comprobante de pago</span>
          <div className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-brand-950/20 px-3 py-3">
            <UploadCloud className="h-5 w-5 text-brand-950/40 shrink-0" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-brand-950/70 file:mr-3 file:rounded-full file:border-0 file:bg-brand-950/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium"
              required
            />
          </div>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <TextureButton
          variant="brand"
          size="default"
          disabled={submitting}
          className="!w-auto px-6 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </TextureButton>
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
