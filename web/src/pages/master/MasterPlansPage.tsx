import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { masterApi } from '@/api/client';
import { BILLING_CYCLE_LABEL, type BillingCycle, type PurchasablePlan } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

interface PlanEntry {
  name: string;
  subtitle: string;
  capacity: string;
  features: string[];
  prices: Record<BillingCycle, number>;
}

type PlanContent = Record<PurchasablePlan, PlanEntry>;

const RESTAURANT_PLAN_ORDER: PurchasablePlan[] = ['DELIVERY', 'PRO', 'ELITE'];
const SHOP_PLAN_ORDER: PurchasablePlan[] = ['SHOP', 'ELITE_SHOP'];
const CLUB_PLAN_ORDER: PurchasablePlan[] = ['CLUB'];
const OFFICE_PLAN_ORDER: PurchasablePlan[] = ['OFFICE'];
const PLAN_ORDER: PurchasablePlan[] = [...RESTAURANT_PLAN_ORDER, ...SHOP_PLAN_ORDER, ...CLUB_PLAN_ORDER, ...OFFICE_PLAN_ORDER];
const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'];

type SubscriptionCurrency = 'USD' | 'EUR';
const CURRENCY_LABEL: Record<SubscriptionCurrency, string> = { USD: '$ Dólares (USD)', EUR: '€ Euros (EUR)' };
const CURRENCY_SYMBOL: Record<SubscriptionCurrency, string> = { USD: '$', EUR: '€' };

export default function MasterPlansPage() {
  const [content, setContent] = useState<PlanContent | null>(null);
  const [currency, setCurrency] = useState<SubscriptionCurrency | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [currencyMessage, setCurrencyMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    masterApi.get('/master/plans').then((res) => setContent(res.data.data));
    masterApi.get('/master/plans/currency').then((res) => setCurrency(res.data.data.currency));
  }, []);

  /** No recalcula ningún precio ya cargado — solo cambia con qué símbolo se muestran y se
   * cobran de ahí en adelante (ver el comentario en PlatformSettings.subscriptionCurrency). */
  async function changeCurrency(next: SubscriptionCurrency) {
    if (next === currency) return;
    setSavingCurrency(true);
    setCurrencyMessage(null);
    try {
      const res = await masterApi.patch('/master/plans/currency', { currency: next });
      setCurrency(res.data.data.currency);
      setCurrencyMessage('Moneda de cobro actualizada.');
    } catch (err: any) {
      setCurrencyMessage(err.response?.data?.error ?? 'No se pudo cambiar la moneda.');
    } finally {
      setSavingCurrency(false);
    }
  }

  function updatePlan(plan: PurchasablePlan, patch: Partial<PlanEntry>) {
    if (!content) return;
    setContent({ ...content, [plan]: { ...content[plan], ...patch } });
  }

  async function save() {
    if (!content) return;
    setSaving(true);
    setMessage(null);
    try {
      // Líneas vacías del textarea (ej. un salto de línea de más al final) no son
      // un beneficio real — se descartan antes de enviar, no mientras se edita.
      const payload = Object.fromEntries(
        PLAN_ORDER.map((plan) => [plan, { ...content[plan], features: content[plan].features.filter((f) => f.trim()) }]),
      );
      const res = await masterApi.patch('/master/plans', payload);
      setContent(res.data.data);
      setMessage('Planes guardados.');
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!content || !currency) return <div className="text-brand-950/50 font-light">Cargando…</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Planes</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Precios y descripción de cada plan, tal como se ven en la landing y en el billing de los restaurantes.
        </p>
      </div>

      <Section title="Moneda de cobro">
        <div className="col-span-full space-y-3">
          <p className="text-sm text-brand-950/60 font-light">
            En qué moneda recibes la mensualidad de los restaurantes/locales — recordatorios de pago,
            comprobantes y el aviso de instalación se piden en esta moneda de ahí en adelante. Cambiarla
            no recalcula los precios de abajo, solo el símbolo con el que se muestran y se cobran.
          </p>
          <div className="flex gap-2">
            {(['USD', 'EUR'] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={savingCurrency}
                onClick={() => changeCurrency(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  currency === c
                    ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                    : 'bg-brand-950/[0.05] text-brand-950/60 hover:text-brand-950'
                }`}
              >
                {CURRENCY_LABEL[c]}
              </button>
            ))}
          </div>
          {currencyMessage && <p className="text-sm text-brand-950/70">{currencyMessage}</p>}
        </div>
      </Section>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-950/40 mb-3">Restaurantes</p>
        <div className="space-y-8">
          {RESTAURANT_PLAN_ORDER.map((plan) => (
            <PlanSection key={plan} entry={content[plan]} currencySymbol={CURRENCY_SYMBOL[currency]} onChange={(patch) => updatePlan(plan, patch)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-950/40 mb-3">Locales Comerciales</p>
        <div className="space-y-8">
          {SHOP_PLAN_ORDER.map((plan) => (
            <PlanSection key={plan} entry={content[plan]} currencySymbol={CURRENCY_SYMBOL[currency]} onChange={(patch) => updatePlan(plan, patch)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-950/40 mb-3">Canchas</p>
        <div className="space-y-8">
          {CLUB_PLAN_ORDER.map((plan) => (
            <PlanSection key={plan} entry={content[plan]} currencySymbol={CURRENCY_SYMBOL[currency]} onChange={(patch) => updatePlan(plan, patch)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-950/40 mb-3">Administración</p>
        <div className="space-y-8">
          {OFFICE_PLAN_ORDER.map((plan) => (
            <PlanSection key={plan} entry={content[plan]} currencySymbol={CURRENCY_SYMBOL[currency]} onChange={(patch) => updatePlan(plan, patch)} />
          ))}
        </div>
      </div>

      {message && <p className="text-sm text-brand-950/70">{message}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50" onClick={save}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </TextureButton>
    </div>
  );
}

function PlanSection({
  entry,
  currencySymbol,
  onChange,
}: {
  entry: PlanEntry;
  currencySymbol: string;
  onChange: (patch: Partial<PlanEntry>) => void;
}) {
  return (
    <Section title={entry.name}>
      <Field label="Nombre" value={entry.name} onChange={(v) => onChange({ name: v })} />
      <Field label="Subtítulo" value={entry.subtitle} onChange={(v) => onChange({ subtitle: v })} />
      <div className="col-span-full">
        <Field label="Capacidad" value={entry.capacity} onChange={(v) => onChange({ capacity: v })} />
      </div>
      <div className="col-span-full">
        <label className="block text-sm">
          <span className="text-brand-950/70">Beneficios (uno por línea)</span>
          <textarea
            value={entry.features.join('\n')}
            onChange={(e) => onChange({ features: e.target.value.split('\n') })}
            rows={Math.max(4, entry.features.length)}
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 font-light"
          />
        </label>
      </div>
      {BILLING_CYCLES.map((c) => (
        <Field
          key={c}
          label={`Precio ${BILLING_CYCLE_LABEL[c]} (${currencySymbol})`}
          value={String(entry.prices[c] ?? '')}
          onChange={(v) => onChange({ prices: { ...entry.prices, [c]: Number(v.replace(/[^0-9.]/g, '')) || 0 } })}
        />
      ))}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
      <p className="font-semibold text-brand-950">{title}</p>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-brand-950/70">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
      />
    </label>
  );
}
