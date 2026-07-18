import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Supplier } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  onSelect: (supplier: Supplier) => void;
}

/** "Escoge el proveedor": lista filtrable con opción de "Agregar Proveedor" al vuelo. */
export function SupplierPicker({ onSelect }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/suppliers').then((res) => setSuppliers(res.data.data));
  }, []);

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  async function createNew() {
    if (!newName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/suppliers', {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        taxId: newTaxId.trim() || undefined,
      });
      onSelect(res.data.data);
      setShowNewForm(false);
      setNewName('');
      setNewPhone('');
      setNewTaxId('');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el proveedor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar proveedor…"
        className="w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
      />
      <div className="max-h-48 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/10">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-brand-950/[0.03]"
          >
            <p className="font-medium text-brand-950">{s.name}</p>
            {(s.phone || s.taxId) && (
              <p className="text-xs text-brand-950/50">
                {[s.phone, s.taxId].filter(Boolean).join(' · ')}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-3 text-center text-xs text-brand-950/40 font-light">Sin resultados.</p>}
      </div>

      {!showNewForm ? (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          + Agregar Proveedor
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-brand-950/10 p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Número de teléfono"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          <input
            value={newTaxId}
            onChange={(e) => setNewTaxId(e.target.value)}
            placeholder="RIF o cédula"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <TextureButton variant="brand" size="sm" className="!w-auto px-3 disabled:opacity-50" disabled={saving} onClick={createNew}>
              {saving ? 'Guardando…' : 'Crear y elegir'}
            </TextureButton>
            <TextureButton variant="minimal" size="sm" className="!w-auto px-3" onClick={() => setShowNewForm(false)}>
              Cancelar
            </TextureButton>
          </div>
        </div>
      )}
    </div>
  );
}
