import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
}

const emptyForm = { name: '', unit: '', quantity: '', minQuantity: '' };

const TABS = [
  { id: 'insumos', label: 'Insumos (normal)' },
  { id: 'recetas', label: 'Recetas' },
] as const;

/** Inventario: insumos con stock directo ("normal"), o por receta vinculada al producto. Exclusivo del plan Premium. */
export default function InventoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('insumos');
  const [items, setItems] = useState<InventoryItem[] | null>(null);

  function loadItems() {
    api.get('/inventory').then((res) => setItems(res.data.data));
  }

  useEffect(loadItems, []);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Inventario</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Insumos con stock directo, o por receta: vinculados a un producto del menú para descontar el stock solo al
          vender.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'insumos' && <InsumosTab items={items} onChanged={loadItems} />}
      {tab === 'recetas' && <RecetasTab insumos={items ?? []} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Insumos (normal): stock directo, tal cual estaba antes.
// -----------------------------------------------------------------------------

function InsumosTab({ items, onChanged }: { items: InventoryItem[] | null; onChanged: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onChanged();
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
    onChanged();
  }

  return (
    <div className="space-y-8">
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

// -----------------------------------------------------------------------------
//  Recetas: vincula productos del menú con insumos.
// -----------------------------------------------------------------------------

interface RecipeOverviewRow {
  productId: string;
  name: string;
  photoUrl: string | null;
  categoryName: string | null;
  hasRecipe: boolean;
  ingredientCount: number;
  totalCostBase: string;
}

function RecetasTab({ insumos }: { insumos: InventoryItem[] }) {
  const [rows, setRows] = useState<RecipeOverviewRow[] | null>(null);
  const [openProductId, setOpenProductId] = useState<string | null>(null);

  function load() {
    api.get('/inventory/recipes').then((res) => setRows(res.data.data));
  }

  useEffect(load, []);

  return (
    <div className="space-y-5">
      {insumos.length === 0 && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3">
          Primero agrega insumos en la pestaña "Insumos (normal)": las recetas se arman a partir de ellos.
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">No tienes productos todavía.</p>}
        {rows?.map((r) => (
          <div key={r.productId} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              {r.photoUrl ? (
                <img src={r.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-brand-950/[0.06] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-brand-950 truncate">{r.name}</p>
                <p className="text-xs text-brand-950/40 font-light">
                  {r.hasRecipe ? `${r.ingredientCount} ingrediente(s) · Costo: $${r.totalCostBase}` : 'Sin receta'}
                </p>
              </div>
            </div>
            <TextureButton
              variant={r.hasRecipe ? 'minimal' : 'brand'}
              size="sm"
              className="!w-auto px-4 shrink-0"
              onClick={() => setOpenProductId(r.productId)}
            >
              Receta
            </TextureButton>
          </div>
        ))}
      </div>

      {openProductId && (
        <RecipeDialog productId={openProductId} insumos={insumos} onClose={() => setOpenProductId(null)} onSaved={load} />
      )}
    </div>
  );
}

interface RecipeLine {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  unit: string;
  stockQuantity: string;
  quantity: string;
  costBase: string;
}

function RecipeDialog({
  productId,
  insumos,
  onClose,
  onSaved,
}: {
  productId: string;
  insumos: InventoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productName, setProductName] = useState('');
  const [lines, setLines] = useState<RecipeLine[] | null>(null);
  const [totalCostBase, setTotalCostBase] = useState('0.00');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ inventoryItemId: '', quantity: '', costBase: '' });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get(`/inventory/recipes/${productId}`).then((res) => {
      setProductName(res.data.data.productName);
      setLines(res.data.data.ingredients);
      setTotalCostBase(res.data.data.totalCostBase);
    });
  }

  useEffect(load, [productId]);

  async function addIngredient() {
    setError(null);
    if (!newItem.inventoryItemId || !newItem.quantity || !newItem.costBase) {
      setError('Completa insumo, cantidad y costo.');
      return;
    }
    try {
      await api.post(`/inventory/recipes/${productId}`, {
        inventoryItemId: newItem.inventoryItemId,
        quantity: Number(newItem.quantity),
        costBase: Number(newItem.costBase),
      });
      setNewItem({ inventoryItemId: '', quantity: '', costBase: '' });
      setAdding(false);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar el ingrediente.');
    }
  }

  async function removeIngredient(id: string) {
    await api.delete(`/inventory/recipes/ingredient/${id}`);
    load();
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receta: {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lines?.length === 0 && !adding && (
            <p className="text-sm text-brand-950/40 font-light">Este producto todavía no tiene ingredientes.</p>
          )}

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {lines?.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                <div className="text-sm">
                  <p className="font-medium text-brand-950">{l.inventoryItemName}</p>
                  <p className="text-xs text-brand-950/50 font-light">
                    {l.quantity} {l.unit} · ${l.costBase}
                  </p>
                </div>
                <button onClick={() => removeIngredient(l.id)} className="text-brand-950/30 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {adding ? (
            <div className="rounded-xl bg-brand-950/[0.04] p-3 space-y-2">
              <select
                value={newItem.inventoryItemId}
                onChange={(e) => setNewItem({ ...newItem, inventoryItemId: e.target.value })}
                className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="">Insumo…</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.unit})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder={`Cantidad usada${newItem.inventoryItemId ? ` (${insumos.find((i) => i.id === newItem.inventoryItemId)?.unit})` : ''}`}
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
                <input
                  value={newItem.costBase}
                  onChange={(e) => setNewItem({ ...newItem, costBase: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="Costo ($)"
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <TextureButton variant="brand" size="sm" className="!w-auto px-4" onClick={addIngredient}>
                  Guardar ingrediente
                </TextureButton>
                <TextureButton variant="minimal" size="sm" className="!w-auto px-4" onClick={() => setAdding(false)}>
                  Cancelar
                </TextureButton>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
            >
              <Plus className="h-4 w-4" /> Añadir ingrediente
            </button>
          )}

          <div className="pt-3 border-t border-brand-950/10 flex items-center justify-between">
            <span className="text-sm text-brand-950/60">Costo total del producto</span>
            <span className="text-lg font-semibold text-brand-950">${totalCostBase}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
