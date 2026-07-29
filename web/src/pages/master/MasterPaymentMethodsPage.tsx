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

      <Section title="Pasarela de pago">
        <div className="col-span-full">
          <Toggle
            checked={methods.ramblayEnabled ?? true}
            onChange={(v) => setMethods({ ...methods, ramblayEnabled: v })}
            label="Pago automatizado (Ramblay)"
            description="C2P/Binance Pay con activación automática. Si lo apagas, los restaurantes solo verán la opción de pago manual."
          />
          <Toggle
            checked={methods.manualPaymentEnabled ?? true}
            onChange={(v) => setMethods({ ...methods, manualPaymentEnabled: v })}
            label="Pago manual"
            description="Transferencia/Zelle/Binance con número de referencia, revisado a mano. Si lo apagas, solo quedará Ramblay."
          />
        </div>
      </Section>

      <Section title="IA de fotos">
        <div className="col-span-full">
          <Toggle
            checked={methods.aiPhotoEnabled ?? true}
            onChange={(v) => setMethods({ ...methods, aiPhotoEnabled: v })}
            label="Mejora de fotos con IA"
            description="Botones 'Mejorar con IA' / 'Fondo blanco con IA' en Restaurantes y Locales (Gemini, facturado a QuickTap). Si lo apagas, ambos botones quedan desactivados en todas las cuentas hasta que lo reactives."
          />
        </div>
      </Section>

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

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <div>
        <p className="text-sm font-medium text-brand-950">{label}</p>
        <p className="text-xs text-brand-950/50 font-light mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-brand-950/15'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
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
