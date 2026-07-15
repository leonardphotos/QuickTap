import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
}

const emptyForm = { name: '', unit: '', quantity: '', minQuantity: '' };

/** Inventario: lista simple de insumos con stock y stock mínimo. Exclusivo del plan Premium. */
export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/inventory').then((res) => setItems(res.data.data));
  }

  useEffect(load, []);

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({ name: item.name, unit: item.unit, quantity: item.quantity, minQuantity: item.minQuantity });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        minQuantity: Number(form.minQuantity) || 0,
      };
      if (editingId) {
        await api.patch(`/inventory/${editingId}`, payload);
      } else {
        await api.post('/inventory', payload);
      }
      cancelEdit();
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el insumo.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: InventoryItem) {
    if (!window.confirm(`¿Eliminar "${item.name}" del inventario?`)) return;
    await api.delete(`/inventory/${item.id}`);
    if (editingId === item.id) cancelEdit();
    load();
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Inventario</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Lleva el control de tus insumos y recibe un aviso cuando estén por debajo del mínimo.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Insumo (ej: Queso)"
            required
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="Unidad (kg, lt, unidad…)"
            required
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          <div className="flex gap-2">
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Cantidad"
              type="number"
              step="0.01"
              min="0"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </div>
        </div>
        <label className="block text-sm max-w-xs">
          <span className="text-brand-950/70">Stock mínimo (aviso de reabastecer)</span>
          <input
            value={form.minQuantity}
            onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
            placeholder="0"
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto px-4 disabled:opacity-50">
            {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar insumo'}
          </TextureButton>
          {editingId && (
            <TextureButton variant="minimal" size="default" type="button" className="!w-auto px-4" onClick={cancelEdit}>
              Cancelar
            </TextureButton>
          )}
        </div>
      </form>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {items?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin insumos todavía.</p>}
        {items?.map((item) => {
          const low = Number(item.quantity) < Number(item.minQuantity);
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium text-brand-950 flex items-center gap-1.5">
                  {item.name}
                  {low && (
                    <span title="Por debajo del stock mínimo">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    </span>
                  )}
                </p>
                <p className={`text-xs font-light mt-0.5 ${low ? 'text-amber-600' : 'text-brand-950/40'}`}>
                  {item.quantity} {item.unit} · mínimo {item.minQuantity} {item.unit}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => startEdit(item)} className="text-xs font-medium text-brand-500 hover:underline">
                  Editar
                </button>
                <button onClick={() => remove(item)} className="text-xs text-red-600 hover:text-red-700">
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
