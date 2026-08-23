import { useEffect, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { officeApi, type Contacto, type Empresa } from './officeApi';

const ROLES = [
  { k: 'isCustomer' as const, label: 'Cliente', color: 'bg-sky-50 text-sky-700' },
  { k: 'isSupplier' as const, label: 'Proveedor', color: 'bg-amber-50 text-amber-700' },
  { k: 'isEmployee' as const, label: 'Empleado', color: 'bg-violet-50 text-violet-700' },
];

/** Clientes, proveedores y empleados. Uno puede ser varias cosas a la vez —hay proveedores que
 *  también compran— así que se marcan con casillas y no con un tipo único. */
export default function OfficeContactosPage({ empresa }: { empresa: Empresa }) {
  const [contactos, setContactos] = useState<Contacto[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<'' | 'isCustomer' | 'isSupplier' | 'isEmployee'>('');
  const [form, setForm] = useState({ name: '', taxId: '', phone: '', email: '', address: '', isCustomer: true, isSupplier: false, isEmployee: false });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() { officeApi.contactos(empresa.id).then(setContactos); }
  useEffect(cargar, [empresa.id]);

  const visibles = (contactos ?? []).filter((c) => {
    if (filtro && !c[filtro]) return false;
    const q = buscar.trim().toLowerCase();
    return q ? `${c.name} ${c.taxId ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q) : true;
  });

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await officeApi.crearContacto(empresa.id, {
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        isCustomer: form.isCustomer,
        isSupplier: form.isSupplier,
        isEmployee: form.isEmployee,
      });
      setForm({ name: '', taxId: '', phone: '', email: '', address: '', isCustomer: true, isSupplier: false, isEmployee: false });
      setAbierto(false);
      cargar();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Clientes y proveedores</h1>
          <p className="mt-0.5 text-[13.5px] text-brand-950/50">Con quién opera {empresa.nombre}.</p>
        </div>
        {!abierto && (
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" /> Nuevo contacto
          </TextureButton>
        )}
      </div>

      {abierto && (
        <div className="mb-6 rounded-2xl border border-brand-950/[0.08] bg-[#FAFAF9] p-5">
          <div className="mb-4 flex items-start justify-between">
            <p className="text-[15px] font-semibold">Nuevo contacto</p>
            <button type="button" onClick={() => setAbierto(false)} className="text-brand-950/35 hover:text-brand-950"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: 'name' as const, label: 'Nombre', ph: 'Distribuidora Andina, C.A.', ancho: 'sm:col-span-2' },
              { k: 'taxId' as const, label: 'RIF / cédula', ph: 'J-12345678-9' },
              { k: 'phone' as const, label: 'Teléfono', ph: '0412-0000000' },
              { k: 'email' as const, label: 'Correo', ph: 'contacto@empresa.com' },
              { k: 'address' as const, label: 'Dirección', ph: 'Av. Principal' },
            ].map((c) => (
              <label key={c.k} className={`block text-sm ${c.ancho ?? ''}`}>
                <span className="text-brand-950/65">{c.label}</span>
                <input value={form[c.k]} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} placeholder={c.ph} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            {ROLES.map((r) => (
              <label key={r.k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form[r.k]} onChange={(e) => setForm({ ...form, [r.k]: e.target.checked })} className="h-4 w-4 rounded border-brand-950/25 accent-brand-500" />
                {r.label}
              </label>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-40" disabled={guardando || !form.name.trim()} onClick={crear}>
              {guardando ? 'Guardando…' : 'Guardar contacto'}
            </TextureButton>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAbierto(false)}>Cancelar</TextureButton>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-950/30" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className="w-full rounded-lg border border-brand-950/15 py-2 pl-9 pr-3 text-sm" />
        </div>
        <div className="flex gap-1">
          {([['', 'Todos'], ...ROLES.map((r) => [r.k, r.label] as const)] as [typeof filtro, string][]).map(([k, label]) => (
            <button key={k || 'all'} type="button" onClick={() => setFiltro(k)} className={`rounded-lg px-3 py-1.5 text-[12.5px] ${filtro === k ? 'bg-brand-950 text-white' : 'text-brand-950/55 hover:bg-brand-950/[0.04]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-950/[0.08]">
        {contactos === null ? (
          <p className="p-6 text-sm text-brand-950/40">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm text-brand-950/40">Sin contactos.</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-brand-950/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-brand-950/35">
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">RIF</th>
                <th className="px-4 py-2.5">Teléfono</th>
                <th className="px-4 py-2.5">Rol</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className="border-b border-brand-950/[0.04]">
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 tabular-nums text-brand-950/50">{c.taxId ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-brand-950/50">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {ROLES.filter((r) => c[r.k]).map((r) => (
                        <span key={r.k} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.color}`}>{r.label}</span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
