import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { officeApi, type Empresa } from './officeApi';

/**
 * Empresas administradas. Es también la pantalla de arranque: sin ninguna empresa cargada no
 * hay nada que contabilizar, así que el formulario aparece abierto en vez de esconderse tras
 * un botón.
 */
export default function OfficeEmpresasPage({
  empresas,
  onCreada,
}: {
  empresas: Empresa[];
  onCreada: (id: string) => void;
}) {
  const vacio = empresas.length === 0;
  const [abierto, setAbierto] = useState(vacio);
  const [form, setForm] = useState({ name: '', taxId: '', currency: 'USD', phone: '', email: '', address: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!form.name.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const creada = await officeApi.crearEmpresa({
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        currency: form.currency,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      setForm({ name: '', taxId: '', currency: 'USD', phone: '', email: '', address: '' });
      setAbierto(false);
      onCreada(creada.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo crear la empresa.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Empresas</h1>
          <p className="mt-0.5 text-[13.5px] text-brand-950/50">
            Cada empresa lleva sus propios libros. Puedes administrar todas las que necesites desde esta misma cuenta.
          </p>
        </div>
        {!abierto && (
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" /> Nueva empresa
          </TextureButton>
        )}
      </div>

      {abierto && (
        <div className="mb-6 rounded-2xl border border-brand-950/[0.08] bg-[#FAFAF9] p-5">
          <p className="mb-1 text-[15px] font-semibold">Nueva empresa</p>
          <p className="mb-4 text-[13px] text-brand-950/50">
            Se crea con un plan de cuentas básico —caja, bancos, clientes, proveedores, ventas, gastos— para que puedas
            registrar el mismo día. Después le agregas las cuentas que necesites.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: 'name' as const, label: 'Nombre', ph: 'Ferretería del Sur, C.A.', ancho: 'sm:col-span-2' },
              { k: 'taxId' as const, label: 'RIF / identificación fiscal', ph: 'J-12345678-9' },
              { k: 'phone' as const, label: 'Teléfono', ph: '0412-0000000' },
              { k: 'email' as const, label: 'Correo', ph: 'admin@empresa.com' },
              { k: 'address' as const, label: 'Dirección', ph: 'Av. Principal, local 4' },
            ].map((c) => (
              <label key={c.k} className={`block text-sm ${c.ancho ?? ''}`}>
                <span className="text-brand-950/65">{c.label}</span>
                <input
                  value={form[c.k]}
                  onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}
                  placeholder={c.ph}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                />
              </label>
            ))}
            <label className="block text-sm">
              <span className="text-brand-950/65">Moneda de los libros</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
              >
                <option value="USD">Dólares (USD)</option>
                <option value="EUR">Euros (EUR)</option>
              </select>
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-40" disabled={guardando || !form.name.trim()} onClick={crear}>
              {guardando ? 'Creando…' : 'Crear empresa'}
            </TextureButton>
            {!vacio && (
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAbierto(false)}>
                Cancelar
              </TextureButton>
            )}
          </div>
        </div>
      )}

      {empresas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onCreada(e.id)}
              className="rounded-2xl border border-brand-950/[0.08] p-4 text-left transition-colors hover:border-brand-500/40"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{e.nombre}</span>
                  <span className="block text-[11.5px] text-brand-950/40">{e.rif ?? 'Sin RIF'}</span>
                </span>
              </div>
              <div className="flex gap-4 text-[12px] text-brand-950/50">
                <span>{e.asientos} asiento{e.asientos === 1 ? '' : 's'}</span>
                <span>{e.contactos} contacto{e.contactos === 1 ? '' : 's'}</span>
                <span className="ml-auto font-medium text-brand-950/60">{e.moneda}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
