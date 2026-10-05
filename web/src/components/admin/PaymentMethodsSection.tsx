import { api } from '@/api/client';
import { InstitutionLogo, InstitutionPicker } from './InstitutionPicker';
import { findInstitution, type FinancialInstitution } from '@/data/financial-institutions';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext.shared';
import type {
PaymentMethodExtraAccount,
PaymentMethodFields,
PaymentMethodKey,
PaymentMethodsConfig,
} from '@/types';
import { Landmark,Plus,Trash2 } from 'lucide-react';
import { useEffect,useState } from 'react';
import { PhotoUploadField } from './PhotoUploadField';

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

// Métodos que se cobran mostrando un QR para escanear. El resto no tiene QR que enseñar
// (efectivo, punto de venta) o se paga con datos escritos (transferencia, PayPal).
const QR_LABELS: Partial<Record<PaymentMethodKey, string>> = {
  MOBILE_PAYMENT: 'QR de Pago Móvil (banco / Suiche 7B)',
  ZELLE: 'QR de Zelle',
  BINANCE: 'QR de Binance',
};

/** Métodos que aceptan varias cuentas (los que llevan datos: dos Zelle, dos Pago Móvil…).
 *  Efectivo y Punto de Venta no — no hay "otra cuenta" que mostrarle al cliente. */
const MULTI_ACCOUNT_METHODS: PaymentMethodKey[] = ['MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER'];

interface BankAccountOption {
  id: string;
  name: string;
  currency: 'BASE' | 'BS';
  isPettyCash: boolean;
}

interface Props {
  /** Reemplaza el copy por defecto (pensado para el checkout de delivery/pickup del restaurante)
   * cuando este componente se reutiliza en un contexto distinto, ej. QuickTap Shop. */
  descriptionOverride?: string;
}

/** Selector de cuenta bancaria registrada (Administración → Cuentas bancarias) para
 *  vincular una cuenta receptora del método: lo que entre por acá suma allá. */
function BankAccountSelect({
  accounts,
  value,
  symbol,
  onChange,
}: {
  accounts: BankAccountOption[];
  value: string | null | undefined;
  symbol: string;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="mt-2.5 flex items-center gap-2 text-sm font-medium">
      <Landmark className="h-4 w-4 shrink-0 text-brand-950/40" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-brand-950/80 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
      >
        <option value="">Sin cuenta bancaria vinculada</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency === 'BS' ? 'Bs' : symbol}){a.isPettyCash ? ' · Caja chica' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Métodos de pago que el restaurante ofrece a sus clientes en el checkout de delivery/pickup. */
export function PaymentMethodsSection({ descriptionOverride }: Props = {}) {
  const { restaurant, refresh } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [config, setConfig] = useState<PaymentMethodsConfig>(restaurant?.paymentMethodsConfig ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cuentas bancarias registradas, para la ventana de vincular. Si el plan no incluye
  // Administración (403) o no hay ninguna, los selectores simplemente no aparecen.
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);

  function addFromCatalog(institution: FinancialInstitution | null) {
    if (!institution) return;
    const key = institution.method as PaymentMethodKey;
    const current = config[key];
    if (current?.institutionId === institution.id || current?.extraAccounts?.some(account => account.institutionId === institution.id)) {
      setMessage('Esta entidad ya está configurada en este método. Puedes editar sus datos debajo.');
      return;
    }
    if ((current?.extraAccounts?.length ?? 0) >= 10) { setError('Este método admite una cuenta principal y hasta 10 adicionales.'); return; }
    setConfig(previous => {
      const existing = previous[key];
      const preset = { institutionId: institution.id, label: institution.name, banco: institution.name };
      // Una selección nunca reemplaza datos de una cuenta que el negocio ya configuró.
      if (!existing || !Object.values(existing).some(value => value !== undefined && value !== null && value !== false && value !== '')) {
        return { ...previous, [key]: { ...existing, ...preset, enabled: false } };
      }
      return { ...previous, [key]: { ...existing, extraAccounts: [...(existing.extraAccounts ?? []), { ...preset, key: crypto.randomUUID() }] } };
    });
    setError(null);
    setMessage(`${institution.name} añadida. Completa sus datos y guarda los cambios. ${current?.enabled ? 'Se añadirá a las cuentas del método que ya tienes activo.' : 'Activa el método únicamente cuando esté listo para cobrar.'}`);
  }

  useEffect(() => {
    api
      .get('/bank-accounts')
      .then((r) => setBankAccounts(r.data.data))
      .catch(() => setBankAccounts([]));
  }, []);

  function toggle(key: PaymentMethodKey) {
    setConfig((c) => ({ ...c, [key]: { ...c[key], enabled: !c[key]?.enabled } }));
  }

  function setField(key: PaymentMethodKey, field: keyof PaymentMethodFields, value: string | null) {
    setConfig((c) => ({ ...c, [key]: { ...c[key], [field]: value } }));
  }

  function addExtraAccount(key: PaymentMethodKey) {
    setConfig((c) => {
      const extras = c[key]?.extraAccounts ?? [];
      const nueva: PaymentMethodExtraAccount = { key: Math.random().toString(36).slice(2, 10) };
      return { ...c, [key]: { ...c[key], extraAccounts: [...extras, nueva] } };
    });
  }

  function setExtraField(
    key: PaymentMethodKey,
    accountKey: string,
    field: keyof PaymentMethodExtraAccount,
    value: string | null,
  ) {
    setConfig((c) => ({
      ...c,
      [key]: {
        ...c[key],
        extraAccounts: (c[key]?.extraAccounts ?? []).map((a) => (a.key === accountKey ? { ...a, [field]: value } : a)),
      },
    }));
  }

  function removeExtraAccount(key: PaymentMethodKey, accountKey: string) {
    setConfig((c) => ({
      ...c,
      [key]: { ...c[key], extraAccounts: (c[key]?.extraAccounts ?? []).filter((a) => a.key !== accountKey) },
    }));
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
        <p className="text-brand-950/60 font-light text-base">
          {descriptionOverride ??
            'Elige qué métodos ofreces a tus clientes en el checkout de delivery/pickup, y sus datos para que sepan a dónde pagar.'}
        </p>
        {bankAccounts.length > 0 && (
          <p className="mt-1 font-light text-brand-950/45 text-xs">
            Vincula cada cuenta con una cuenta bancaria registrada: lo que cobres por ese método sumará su saldo
            automáticamente.
          </p>
        )}
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        {restaurant?.businessType === 'RESTAURANT' && <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-4 text-sm font-medium">
          <span><span className="block text-sm font-semibold text-brand-950">Mostrar métodos de pago en el menú público</span><span className="mt-1 block text-xs text-brand-950/60">Al desactivarlo, el cliente envía su pedido sin ver datos de cobro. Confirma el pedido antes de indicarle cómo pagar. Los métodos de caja se mantienen.</span></span>
          <button type="button" role="switch" aria-label="Mostrar métodos de pago en el menú público" aria-checked={!config.publicMenu?.hidden} onClick={()=>setConfig(c=>({...c,publicMenu:{hidden:!c.publicMenu?.hidden}}))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${!config.publicMenu?.hidden?'bg-brand-500':'bg-brand-950/15'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${!config.publicMenu?.hidden?'translate-x-5':''}`}/></button>
        </label>}
        <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-4 space-y-2">
          <p className="font-semibold text-brand-950 text-base">Agregar desde el catálogo</p>
          <InstitutionPicker onChange={addFromCatalog}/>
          <p className="text-brand-950/55 text-xs">Bancos venezolanos, internacionales y plataformas. Las plataformas sin método propio se registran como cuentas de Transferencia con su nombre. No conecta APIs ni valida pagos automáticamente.</p>
        </div>
        <div className="space-y-1 divide-y divide-brand-950/[0.06]">
          {METHODS.map((m) => {
            const enabled = Boolean(config[m.key]?.enabled);
            const extras = config[m.key]?.extraAccounts ?? [];
            const multi = MULTI_ACCOUNT_METHODS.includes(m.key);
            return (
              <div key={m.key} className="py-3">
                <label className="flex items-center justify-between gap-4 cursor-pointer text-sm font-medium">
                  <p className="font-medium text-brand-950 text-base">
                    {m.label}
                    {enabled && extras.length > 0 && (
                      <span className="ml-2 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
                        {extras.length + 1} cuentas
                      </span>
                    )}
                  </p>
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

                {(enabled || config[m.key]?.institutionId || extras.length > 0) && m.fields.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2 mt-2.5">
                    <div className="sm:col-span-2">
                      <InstitutionPicker value={config[m.key]?.institutionId} venezuelaOnly={m.key === 'MOBILE_PAYMENT'} onChange={institution => {
                        setConfig(previous => ({ ...previous, [m.key]: { ...previous[m.key], institutionId: institution?.id ?? null, ...(institution ? { banco: institution.name } : {}) } }));
                      }}/>
                    </div>
                    {/* Con más de una cuenta, la principal también necesita nombre propio. */}
                    {(extras.length > 0 || config[m.key]?.institutionId) && (
                      <input
                        value={config[m.key]?.label ?? ''}
                        onChange={(e) => setField(m.key, 'label', e.target.value)}
                        placeholder={`Nombre (ej. ${m.label} principal)`}
                        className="sm:col-span-2 border border-brand-950/15 rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                      />
                    )}
                    {m.fields.map((f) => (
                      <input
                        key={f.key}
                        value={(config[m.key]?.[f.key] as string | undefined) ?? ''}
                        onChange={(e) => setField(m.key, f.key, e.target.value)}
                        placeholder={f.key === 'cuenta' && findInstitution(config[m.key]?.institutionId)?.group === 'PLATFORM' ? 'Cuenta / correo / ID receptor' : f.label}
                        className="border border-brand-950/15 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                      />
                    ))}
                  </div>
                )}

                {enabled && bankAccounts.length > 0 && (
                  <BankAccountSelect
                    accounts={bankAccounts}
                    value={config[m.key]?.bankAccountId}
                    symbol={symbol}
                    onChange={(id) => setField(m.key, 'bankAccountId', id)}
                  />
                )}

                {enabled && QR_LABELS[m.key] && (
                  <div className="mt-3 max-w-[180px]">
                    <PhotoUploadField
                      value={config[m.key]?.qrImageUrl ?? null}
                      onChange={(url) => setField(m.key, 'qrImageUrl', url ?? null)}
                      label={QR_LABELS[m.key]!}
                      uploadUrl="/restaurant/upload-payment-qr"
                      shape="square"
                      helpText={`Se muestra a tus clientes al cobrar por ${m.label}`}
                    />
                  </div>
                )}

                {/* Cuentas adicionales del método: el segundo Zelle, el segundo Pago Móvil… */}
                {(enabled || extras.length > 0) &&
                  extras.map((acc, i) => (
                    <div key={acc.key} className="mt-3 rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-bold uppercase tracking-wide text-brand-950/45 text-xs">
                          <InstitutionLogo id={acc.institutionId}/>
                          {acc.label?.trim() || `${m.label} ${i + 2}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeExtraAccount(m.key, acc.key)}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Quitar
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 mt-2">
                        <div className="sm:col-span-2"><InstitutionPicker value={acc.institutionId} venezuelaOnly={m.key === 'MOBILE_PAYMENT'} onChange={institution => {
                          setConfig(previous => ({ ...previous, [m.key]: { ...previous[m.key], extraAccounts: (previous[m.key]?.extraAccounts ?? []).map(account => account.key === acc.key ? { ...account, institutionId: institution?.id ?? null, ...(institution ? { banco: institution.name } : {}) } : account) } }));
                        }}/></div>
                        <input
                          value={acc.label ?? ''}
                          onChange={(e) => setExtraField(m.key, acc.key, 'label', e.target.value)}
                          placeholder={`Nombre (ej. ${m.label} 2)`}
                          className="sm:col-span-2 border border-brand-950/15 rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                        />
                        {m.fields.map((f) => (
                          <input
                            key={f.key}
                            value={(acc[f.key as keyof PaymentMethodExtraAccount] as string | undefined) ?? ''}
                            onChange={(e) => setExtraField(m.key, acc.key, f.key as keyof PaymentMethodExtraAccount, e.target.value)}
                            placeholder={f.key === 'cuenta' && findInstitution(acc.institutionId)?.group === 'PLATFORM' ? 'Cuenta / correo / ID receptor' : f.label}
                            className="border border-brand-950/15 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                          />
                        ))}
                      </div>
                      {bankAccounts.length > 0 && (
                        <BankAccountSelect
                          accounts={bankAccounts}
                          value={acc.bankAccountId}
                          symbol={symbol}
                          onChange={(id) => setExtraField(m.key, acc.key, 'bankAccountId', id)}
                        />
                      )}
                      {QR_LABELS[m.key] && (
                        <div className="mt-3 max-w-[180px]">
                          <PhotoUploadField
                            value={acc.qrImageUrl ?? null}
                            onChange={(url) => setExtraField(m.key, acc.key, 'qrImageUrl', url ?? null)}
                            label={QR_LABELS[m.key]!}
                            uploadUrl="/restaurant/upload-payment-qr"
                            shape="square"
                            helpText="QR de esta cuenta en particular"
                          />
                        </div>
                      )}
                    </div>
                  ))}

                {enabled && multi && (
                  <button
                    type="button"
                    onClick={() => addExtraAccount(m.key)}
                    className="mt-2.5 flex items-center gap-1.5 rounded-full border border-dashed border-brand-950/20 px-3 py-1.5 text-[12px] font-semibold text-brand-950/60 transition-colors hover:border-brand-500 hover:text-brand-600"
                  >
                    <Plus className="h-3.5 w-3.5" /> Añadir otra cuenta de {m.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-600 text-base">{error}</p>}
        {message && <p className="text-brand-500 text-base">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
