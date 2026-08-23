import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { officeApi, type Cuenta, type Empresa } from './officeApi';
import { COLOR_TIPO, NOMBRE_TIPO, money } from './officeFormat';

/** Plan de cuentas con su saldo. La sangría muestra el árbol: sin ella, cuarenta códigos
 *  seguidos no dejan ver qué cuelga de qué. */
export default function OfficeCuentasPage({ empresa }: { empresa: Empresa }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', kind: 'EXPENSE', parentId: '', postable: true });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() { officeApi.cuentas(empresa.id).then(setCuentas); }
  useEffect(cargar, [empresa.id]);

  const m = money.bind(null, empresa);
  const nivel = (code: string) => code.split('.').length - 1;

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await officeApi.crearCuenta(empresa.id, {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        parentId: form.parentId || undefined,
        postable: form.postable,
      });
      setForm({ code: '', name: '', kind: 'EXPENSE', parentId: '', postable: true });
      setAbierto(false);
      cargar();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo crear la cuenta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Plan de cuentas</h1>
          <p className="mt-0.5 text-[13.5px] text-brand-950/50">
            Las cuentas en gris son de agrupación: totalizan a sus hijas y no reciben asientos.
          </p>
        </div>
        {!abierto && (
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" /> Nueva cuenta
          </TextureButton>
        )}
      </div>

      {abierto && (
        <div className="mb-6 rounded-2xl border border-brand-950/[0.08] bg-[#FAFAF9] p-5">
          <div className="mb-4 flex items-start justify-between">
            <p className="text-[15px] font-semibold">Nueva cuenta</p>
            <button type="button" onClick={() => setAbierto(false)} className="text-brand-950/35 hover:text-brand-950"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-sm">
              <span className="text-brand-950/65">Código</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="5.2.09" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 tabular-nums" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-brand-950/65">Nombre</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seguros" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/65">Naturaleza</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2">
                {Object.entries(NOMBRE_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-sm sm:col-span-3">
              <span className="text-brand-950/65">Depende de (opcional)</span>
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2">
                <option value="">Ninguna</option>
                {(cuentas ?? []).filter((c) => !c.postable).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={form.postable} onChange={(e) => setForm({ ...form, postable: e.target.checked })} className="h-4 w-4 rounded border-brand-950/25 accent-brand-500" />
              Recibe asientos
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-40" disabled={guardando || !form.code.trim() || !form.name.trim()} onClick={crear}>
              {guardando ? 'Creando…' : 'Crear cuenta'}
            </TextureButton>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAbierto(false)}>Cancelar</TextureButton>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-950/[0.08]">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-brand-950/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-brand-950/35">
              <th className="px-4 py-2.5">Cuenta</th>
              <th className="px-4 py-2.5">Naturaleza</th>
              <th className="px-4 py-2.5 text-right">Debe</th>
              <th className="px-4 py-2.5 text-right">Haber</th>
              <th className="px-4 py-2.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {(cuentas ?? []).map((c) => (
              <tr key={c.id} className={`border-b border-brand-950/[0.04] ${c.postable ? '' : 'bg-brand-950/[0.02]'}`}>
                <td className="px-4 py-2.5">
                  <span style={{ paddingLeft: `${nivel(c.code) * 16}px` }} className="flex items-baseline gap-2">
                    <span className="tabular-nums text-brand-950/40">{c.code}</span>
                    <span className={c.postable ? '' : 'font-medium text-brand-950/55'}>{c.name}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_TIPO[c.kind]}`}>{NOMBRE_TIPO[c.kind]}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-brand-950/50">{Number(c.debe) ? m(c.debe) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-brand-950/50">{Number(c.haber) ? m(c.haber) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{Number(c.saldo) ? m(c.saldo) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cuentas === null && <p className="p-6 text-sm text-brand-950/40">Cargando…</p>}
      </div>
    </div>
  );
}
