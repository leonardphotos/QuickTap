import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { useAuth } from '@/context/AuthContext.shared';
import type { Customer } from '@/types';
import { canManagePartners } from '@/utils/roles';
import { ChevronRight,Pencil,Search,Star } from 'lucide-react';
import { useEffect,useImperativeHandle,useRef,useState,type Ref } from 'react';

export interface CustomerPickerHandle { resolve: () => Promise<Customer | null> }

interface Props {
  onSelect: (customer: Customer) => void;
  resolveRef?: Ref<CustomerPickerHandle>;
  onContinue?: () => void;
}

/** Campos que se pueden tocar desde acá: los mismos al crear y al editar. */
type Borrador = { name: string; phone: string; idNumber: string; isPartner: boolean };

const VACIO: Borrador = { name: '', phone: '', idNumber: '', isPartner: false };

/**
 * Buscador de clientes (nombre/teléfono/cédula) con alta y edición al vuelo.
 *
 * La edición vive acá y no solo en el CRM porque el error se descubre justo en este momento:
 * se elige al cliente para el pedido y ahí se ve que el teléfono quedó mal escrito. Mandar a
 * alguien a Administración → CRM en medio de un pedido es garantía de que nadie lo corrija.
 */
export function CustomerPicker({ onSelect, resolveRef, onContinue }: Props) {
  const { user } = useAuth();
  const puedeSocios = canManagePartners(user?.role);

  const [search, setSearch] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [needsPhone, setNeedsPhone] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Customer[]>([]);
  // null = no hay formulario abierto; 'new' = alta; un id = edición de ese cliente.
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  useEffect(() => { if (needsPhone && !saving) phoneRef.current?.focus(); }, [needsPhone, saving]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      // El endpoint del CRM devuelve { customers, summary }; acá solo interesa la lista.
      api
        .get('/customers', { params: { search: search || undefined } })
        .then((res) => { if (!cancelled) setResults(res.data.data.customers); })
        .catch(() => { if (!cancelled) { setResults([]); setError('No se pudo buscar. Intenta nuevamente.'); } });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, recargar]);

  useImperativeHandle(resolveRef, () => ({ resolve: async () => {
    const name = search.trim();
    if (!name) return null;
    setSaving(true); setError(null);
    try {
      const { data } = await api.post('/customers/quick', { name, ...(needsPhone ? { phone: newPhone.trim() } : {}) });
      return data.data;
    } catch (error: any) {
      if (error.response?.data?.error === 'Este cliente es nuevo. Ingresa su número de teléfono para continuar.') setNeedsPhone(true);
      setError(error.response?.data?.error ?? 'No se pudo guardar el cliente. Intenta nuevamente.');
      throw error;
    } finally { setSaving(false); }
  } }));

  function abrirEdicion(c: Customer) {
    setBorrador({ name: c.name, phone: c.phone, idNumber: c.idNumber ?? '', isPartner: Boolean(c.isPartner) });
    setError(null);
    setEditando(c.id);
  }

  async function guardar() {
    if (!borrador.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cuerpo = {
        name: borrador.name.trim(),
        phone: borrador.phone.trim() || undefined,
        idNumber: borrador.idNumber.trim() || undefined,
        // Solo se manda si este usuario puede: el backend rechaza el campo para los demás,
        // y mandarlo igual convertiría una edición inocente en un 403.
        ...(puedeSocios ? { isPartner: borrador.isPartner } : {}),
      };
      await api.patch(`/customers/${editando}`, cuerpo);
      setEditando(null);
      setBorrador(VACIO);
      // Al crear se elige de una vez (es lo que se venía a hacer); al editar solo se refresca
      // la lista, porque quizá se estaba corrigiendo a alguien que ni siquiera es el del pedido.
      setRecargar((n) => n + 1);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setError(null); setNeedsPhone(false); setNewPhone(''); }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!saving) onContinue?.(); } }}
          disabled={saving}
          maxLength={120}
          placeholder="Nombre, teléfono o cédula"
          className="min-h-12 w-full rounded-2xl border border-brand-950/10 bg-brand-950/[0.035] py-3 pl-10 pr-3 text-brand-950 outline-none transition-[background-color,box-shadow,border-color] placeholder:text-brand-950/35 focus:border-brand-500/40 focus:bg-white focus:ring-4 focus:ring-brand-500/10 text-base"
        />
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl bg-brand-950/[0.025] p-1.5 [scrollbar-width:thin]">
        {results.map((c) => (
          <div key={c.id} className="group flex min-h-14 items-stretch rounded-xl bg-white shadow-[0_1px_2px_rgba(0,29,65,0.04)] ring-1 ring-brand-950/[0.045] transition-shadow hover:shadow-sm">
            <button
              type="button"
              disabled={saving}
              onClick={() => onSelect(c)}
              className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 rounded-l-xl px-3 py-2.5 text-left transition-[background-color,transform] hover:bg-brand-500/[0.04] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-sm font-bold text-brand-600">
                {c.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="min-w-0 flex-1">
              <span className="font-semibold text-brand-950 truncate flex items-center gap-1.5">
                {c.name}
                {c.isPartner && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                    <Star className="h-2.5 w-2.5" /> Socio
                  </span>
                )}
              </span>
              <span className="block text-xs text-brand-950/50 truncate">
                {c.phone}
                {c.idNumber ? ` · ${c.idNumber}` : ''}
              </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-950/20 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => abrirEdicion(c)}
              title={`Editar ${c.name}`}
              aria-label={`Editar ${c.name}`}
              className="touch-manipulation rounded-r-xl px-3 text-brand-950/25 transition-colors hover:bg-brand-950/[0.035] hover:text-brand-500 active:text-brand-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {results.length === 0 && (
          <p className="px-3 py-3 text-center text-brand-950/40 font-light text-xs">Sin resultados.</p>
        )}
      </div>

      {!editando && needsPhone && (
        <label className="block space-y-2 rounded-2xl border border-brand-950/10 p-3 text-sm font-medium">
          <span className="text-sm font-semibold text-brand-950">Teléfono del nuevo cliente</span>
          <input ref={phoneRef} type="tel" autoComplete="tel" value={newPhone} disabled={saving}
            onChange={event => { setNewPhone(event.target.value); setError(null); }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!saving) onContinue?.(); } }}
            placeholder="Ej. 0414 123 4567" maxLength={30} required
            className="min-h-12 w-full rounded-xl border border-brand-950/10 bg-white px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 text-base" />
          <span className="block text-xs text-brand-950/50">Se guardará con su nombre al pulsar Siguiente.</span>
        </label>
      )}
      {!editando && !needsPhone && <p className="text-brand-950/50 text-xs">Si el cliente es nuevo, te pediremos su teléfono antes de continuar.</p>}
      {!editando && error && <p role="alert" className="text-red-600 text-xs">{error}</p>}
      {editando !== null && (
        <div className="space-y-2 rounded-xl border border-brand-950/10 p-3">
          <p className="font-semibold text-brand-950/50 text-xs">
            Editando cliente
          </p>
          <input
            autoFocus
            value={borrador.name}
            onChange={(e) => setBorrador((b) => ({ ...b, name: e.target.value }))}
            placeholder="Nombre"
            className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
          />
          <input
            value={borrador.phone}
            onChange={(e) => setBorrador((b) => ({ ...b, phone: e.target.value }))}
            placeholder="Teléfono"
            className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
          />
          <input
            value={borrador.idNumber}
            onChange={(e) => setBorrador((b) => ({ ...b, idNumber: e.target.value }))}
            placeholder="Cédula (opcional)"
            className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
          />

          {puedeSocios && (
            <label className="flex items-start gap-2 rounded-lg bg-violet-50 px-2.5 py-2 cursor-pointer text-sm font-medium">
              <input
                type="checkbox"
                checked={borrador.isPartner}
                onChange={(e) => setBorrador((b) => ({ ...b, isPartner: e.target.checked }))}
                className="mt-0.5 accent-violet-600"
              />
              <span className="text-xs text-violet-900 leading-relaxed">
                <span className="font-semibold">Es socio.</span> Lo que consuma no cuenta como venta ni entra en
                administración, pero sí se descuenta del inventario.
              </span>
            </label>
          )}

          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <TextureButton
              variant="brand"
              size="sm"
              className="!w-auto disabled:opacity-50"
              disabled={saving}
              onClick={guardar}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </TextureButton>
            <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setEditando(null)}>
              Cancelar
            </TextureButton>
          </div>
        </div>
      )}
    </div>
  );
}
