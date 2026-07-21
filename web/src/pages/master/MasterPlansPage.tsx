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

const PLAN_ORDER: PurchasablePlan[] = ['DELIVERY', 'PRO', 'SUCURSALES', 'DELIVERY_SUCURSALES'];
const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'];

export default function MasterPlansPage() {
  const [content, setContent] = useState<PlanContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    masterApi.get('/master/plans').then((res) => setContent(res.data.data));
  }, []);

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

  if (!content) return <div className="text-brand-950/50 font-light">Cargando…</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Planes</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Precios y descripción de cada plan, tal como se ven en la landing y en el billing de los restaurantes.
        </p>
      </div>

      {PLAN_ORDER.map((plan) => (
        <PlanSection key={plan} entry={content[plan]} onChange={(patch) => updatePlan(plan, patch)} />
      ))}

      {message && <p className="text-sm text-brand-950/70">{message}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50" onClick={save}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </TextureButton>
    </div>
  );
}

function PlanSection({ entry, onChange }: { entry: PlanEntry; onChange: (patch: Partial<PlanEntry>) => void }) {
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
          label={`Precio ${BILLING_CYCLE_LABEL[c]} (USD)`}
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
