import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import type { PaymentMethodFields, PaymentMethodKey, PaymentMethodsConfig } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

interface MethodDef {
  key: PaymentMethodKey;
  label: string;
  fields: { key: keyof PaymentMethodFields; label: string }[];
}

const METHODS: MethodDef[] = [
  { key: 'CASH', label: 'Efectivo Bs', fields: [] },
  { key: 'CASH_USD', label: 'Efectivo $', fields: [] },
  {
    key: 'MOBILE_PAYMENT',
    label: 'Pago Móvil',
    fields: [
      { key: 'banco', label: 'Banco' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'cedula', label: 'Cédula/RIF' },
      { key: 'titular', label: 'Titular' },
    ],
  },
  {
    key: 'ZELLE',
    label: 'Zelle',
    fields: [
      { key: 'correo', label: 'Correo' },
      { key: 'titular', label: 'Titular' },
    ],
  },
  {
    key: 'BINANCE',
    label: 'Binance',
    fields: [
      { key: 'id', label: 'Binance ID' },
      { key: 'correo', label: 'Correo' },
    ],
  },
  { key: 'PAYPAL', label: 'PayPal', fields: [{ key: 'correo', label: 'Correo' }] },
  {
    key: 'TRANSFER',
    label: 'Transferencia',
    fields: [
      { key: 'banco', label: 'Banco' },
      { key: 'cuenta', label: 'N° de cuenta' },
      { key: 'titular', label: 'Titular' },
      { key: 'rif', label: 'RIF' },
    ],
  },
  { key: 'CARD', label: 'Punto de Venta', fields: [] },
];

/** Métodos de pago que el restaurante ofrece a sus clientes en el checkout de delivery/pickup. */
export function PaymentMethodsSection() {
  const { restaurant, refresh } = useAuth();
  const [config, setConfig] = useState<PaymentMethodsConfig>(restaurant?.paymentMethodsConfig ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: PaymentMethodKey) {
    setConfig((c) => ({ ...c, [key]: { ...c[key], enabled: !c[key]?.enabled } }));
  }

  function setField(key: PaymentMethodKey, field: keyof PaymentMethodFields, value: string) {
    setConfig((c) => ({ ...c, [key]: { ...c[key], [field]: value } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { paymentMethodsConfig: config });
      await refresh();
      setMessage('Métodos de pago guardados.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Métodos de pago</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Elige qué métodos ofreces a tus clientes en el checkout de delivery/pickup, y sus datos para que sepan a
          dónde pagar.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <div className="space-y-1 divide-y divide-brand-950/[0.06]">
          {METHODS.map((m) => {
            const enabled = Boolean(config[m.key]?.enabled);
            return (
              <div key={m.key} className="py-3">
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <p className="text-sm font-medium text-brand-950">{m.label}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => toggle(m.key)}
                    className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-brand-500' : 'bg-brand-950/15'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`}
                    />
                  </button>
                </label>

                {enabled && m.fields.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2 mt-2.5">
                    {m.fields.map((f) => (
                      <input
                        key={f.key}
                        value={(config[m.key]?.[f.key] as string | undefined) ?? ''}
                        onChange={(e) => setField(m.key, f.key, e.target.value)}
                        placeholder={f.label}
                        className="border border-brand-950/15 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
