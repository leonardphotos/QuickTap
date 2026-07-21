import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { masterApi } from '@/api/client';
import type { PlatformPaymentMethods } from '@/utils/plans';
import { TextureButton } from '@/components/ui/texture-button';

export default function MasterPaymentMethodsPage() {
  const [methods, setMethods] = useState<PlatformPaymentMethods>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    masterApi.get('/master/payment-methods').then((res) => setMethods(res.data.data ?? {}));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await masterApi.patch('/master/payment-methods', methods);
      setMessage('Datos de pago guardados.');
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Datos de pago</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Lo que ven los restaurantes en la pasarela de pago (landing y panel).
        </p>
      </div>

      <Section title="Pago Móvil">
        <Field
          label="Banco"
          value={methods.pagoMovil?.banco ?? ''}
          onChange={(v) => setMethods({ ...methods, pagoMovil: { ...methods.pagoMovil, banco: v } })}
        />
        <Field
          label="Teléfono"
          value={methods.pagoMovil?.telefono ?? ''}
          onChange={(v) => setMethods({ ...methods, pagoMovil: { ...methods.pagoMovil, telefono: v } })}
        />
        <Field
          label="Cédula/RIF"
          value={methods.pagoMovil?.cedula ?? ''}
          onChange={(v) => setMethods({ ...methods, pagoMovil: { ...methods.pagoMovil, cedula: v } })}
        />
        <Field
          label="Titular"
          value={methods.pagoMovil?.titular ?? ''}
          onChange={(v) => setMethods({ ...methods, pagoMovil: { ...methods.pagoMovil, titular: v } })}
        />
      </Section>

      <Section title="Binance">
        <Field
          label="Binance ID"
          value={methods.binance?.id ?? ''}
          onChange={(v) => setMethods({ ...methods, binance: { ...methods.binance, id: v } })}
        />
        <Field
          label="Correo"
          value={methods.binance?.correo ?? ''}
          onChange={(v) => setMethods({ ...methods, binance: { ...methods.binance, correo: v } })}
        />
      </Section>

      <Section title="Transferencia bancaria">
        <Field
          label="Banco"
          value={methods.bankTransfer?.banco ?? ''}
          onChange={(v) => setMethods({ ...methods, bankTransfer: { ...methods.bankTransfer, banco: v } })}
        />
        <Field
          label="Cuenta"
          value={methods.bankTransfer?.cuenta ?? ''}
          onChange={(v) => setMethods({ ...methods, bankTransfer: { ...methods.bankTransfer, cuenta: v } })}
        />
        <Field
          label="Titular"
          value={methods.bankTransfer?.titular ?? ''}
          onChange={(v) => setMethods({ ...methods, bankTransfer: { ...methods.bankTransfer, titular: v } })}
        />
        <Field
          label="RIF"
          value={methods.bankTransfer?.rif ?? ''}
          onChange={(v) => setMethods({ ...methods, bankTransfer: { ...methods.bankTransfer, rif: v } })}
        />
      </Section>

      {message && <p className="text-sm text-brand-950/70">{message}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50" onClick={save}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </TextureButton>
    </div>
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
