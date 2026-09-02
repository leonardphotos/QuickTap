import { useEffect, useState } from 'react';
import { Pencil, Star } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { canManagePartners } from '@/utils/roles';
import type { Customer } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  onSelect: (customer: Customer) => void;
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
export function CustomerPicker({ onSelect }: Props) {
  const { user } = useAuth();
  const puedeSocios = canManagePartners(user?.role);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  // null = no hay formulario abierto; 'new' = alta; un id = edición de ese cliente.
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      // El endpoint del CRM devuelve { customers, summary }; acá solo interesa la lista.
      api
        .get('/customers', { params: { search: search || undefined } })
        .then((res) => setResults(res.data.data.customers));
    }, 300);
    return () => clearTimeout(t);
  }, [search, recargar]);

  function abrirAlta() {
    setBorrador(VACIO);
    setError(null);
    setEditando('new');
  }

  function abrirEdicion(c: Customer) {
    setBorrador({ name: c.name, phone: c.phone, idNumber: c.idNumber ?? '', isPartner: Boolean(c.isPartner) });
    setError(null);
    setEditando(c.id);
  }

  async function guardar() {
    if (!borrador.name.trim() || !borrador.phone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cuerpo = {
        name: borrador.name.trim(),
        phone: borrador.phone.trim(),
        idNumber: borrador.idNumber.trim() || undefined,
        // Solo se manda si este usuario puede: el backend rechaza el campo para los demás,
        // y mandarlo igual convertiría una edición inocente en un 403.
        ...(puedeSocios ? { isPartner: borrador.isPartner } : {}),
      };
      const res =
        editando === 'new' ? await api.post('/customers', cuerpo) : await api.patch(`/customers/${editando}`, cuerpo);
      setEditando(null);
      setBorrador(VACIO);
      // Al crear se elige de una vez (es lo que se venía a hacer); al editar solo se refresca
      // la lista, porque quizá se estaba corrigiendo a alguien que ni siquiera es el del pedido.
      if (editando === 'new') onSelect(res.data.data);
      else setRecargar((n) => n + 1);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar cliente por nombre, teléfono o cédula…"
        className="w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
      />
      <div className="max-h-48 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/10">
        {results.map((c) => (
          <div key={c.id} className="flex items-stretch hover:bg-brand-950/[0.03]">
            <button type="button" onClick={() => onSelect(c)} className="flex-1 text-left px-3 py-2 text-sm min-w-0">
              <p className="font-medium text-brand-950 truncate flex items-center gap-1.5">
                {c.name}
                {c.isPartner && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                    <Star className="h-2.5 w-2.5" /> Socio
                  </span>
                )}
              </p>
              <p className="text-xs text-brand-950/50 truncate">
                {c.phone}
                {c.idNumber ? ` · ${c.idNumber}` : ''}
              </p>
            </button>
            <button
              type="button"
              onClick={() => abrirEdicion(c)}
              title={`Editar ${c.name}`}
              aria-label={`Editar ${c.name}`}
              className="px-3 text-brand-950/30 hover:text-brand-500 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {results.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-brand-950/40 font-light">Sin resultados.</p>
        )}
      </div>

      {editando === null ? (
        <button type="button" onClick={abrirAlta} className="text-sm font-medium text-brand-500 hover:text-brand-600">
          + Nuevo cliente
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-brand-950/10 p-3">
          <p className="text-xs font-semibold text-brand-950/50">
            {editando === 'new' ? 'Nuevo cliente' : 'Editando cliente'}
          </p>
          <input
            autoFocus
            value={borrador.name}
            onChange={(e) => setBorrador((b) => ({ ...b, name: e.target.value }))}
            placeholder="Nombre"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          <input
            value={borrador.phone}
            onChange={(e) => setBorrador((b) => ({ ...b, phone: e.target.value }))}
            placeholder="Teléfono"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          <input
            value={borrador.idNumber}
            onChange={(e) => setBorrador((b) => ({ ...b, idNumber: e.target.value }))}
            placeholder="Cédula (opcional)"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />

          {puedeSocios && (
            <label className="flex items-start gap-2 rounded-lg bg-violet-50 px-2.5 py-2 cursor-pointer">
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

          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <TextureButton
              variant="brand"
              size="sm"
              className="!w-auto disabled:opacity-50"
              disabled={saving}
              onClick={guardar}
            >
              {saving ? 'Guardando…' : editando === 'new' ? 'Crear y elegir' : 'Guardar cambios'}
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
