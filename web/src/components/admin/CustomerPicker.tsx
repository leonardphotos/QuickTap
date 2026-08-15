import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Customer } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  onSelect: (customer: Customer) => void;
}

/** Buscador de clientes (nombre/teléfono/cédula) con opción de crear uno nuevo al vuelo. */
export function CustomerPicker({ onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newIdNumber, setNewIdNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      // El endpoint del CRM devuelve { customers, summary }; acá solo interesa la lista.
      api.get('/customers', { params: { search: search || undefined } }).then((res) => setResults(res.data.data.customers));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function createNew() {
    if (!newName.trim() || !newPhone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/customers', {
        name: newName.trim(),
        phone: newPhone.trim(),
        idNumber: newIdNumber.trim() || undefined,
      });
      onSelect(res.data.data);
      setShowNewForm(false);
      setNewName('');
      setNewPhone('');
      setNewIdNumber('');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el cliente.');
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
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-brand-950/[0.03]"
          >
            <p className="font-medium text-brand-950">{c.name}</p>
            <p className="text-xs text-brand-950/50">
              {c.phone}
              {c.idNumber ? ` · ${c.idNumber}` : ''}
            </p>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-3 text-center text-xs text-brand-950/40 font-light">Sin resultados.</p>}
      </div>

      {!showNewForm ? (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          + Nuevo cliente
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
            placeholder="Teléfono"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          <input
            value={newIdNumber}
            onChange={(e) => setNewIdNumber(e.target.value)}
            placeholder="Cédula (opcional)"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <TextureButton variant="brand" size="sm" className="!w-auto disabled:opacity-50" disabled={saving} onClick={createNew}>
              {saving ? 'Guardando…' : 'Crear y elegir'}
            </TextureButton>
            <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setShowNewForm(false)}>
              Cancelar
            </TextureButton>
          </div>
        </div>
      )}
    </div>
  );
}
