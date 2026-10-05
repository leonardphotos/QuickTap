import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/api/client';
import type { Category } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onChanged: () => void;
}

export function CategoryDialog({ open, onOpenChange, categories, onChanged }: Props) {
  const [name, setName] = useState('');
  const [kitchens, setKitchens] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (open) api.get('/kitchens').then((res) => setKitchens(res.data.data)).catch(() => setError('No se pudieron cargar las cocinas.'));
  }, [open]);
  async function assignKitchen(id: string, kitchenId: string) {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/categories/${id}`, { kitchenId: kitchenId || null });
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo asignar la cocina.');
    } finally { setSaving(false); }
  }
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState(categories);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => setOrderedCategories(categories), [categories]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/categories', { name, priority: categories.length });
      setName('');
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta categoría?')) return;
    try {
      await api.delete(`/categories/${id}`);
      onChanged();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'No se pudo borrar.');
    }
  }

  async function saveOrder(next: Category[], previous = orderedCategories) {
    if (saving) return;
    setOrderedCategories(next);
    setSaving(true);
    try {
      await api.patch('/categories/reorder', { categoryIds: next.map((category) => category.id) });
      onChanged();
    } catch (err: any) {
      setOrderedCategories(previous);
      setError(err.response?.data?.error ?? 'No se pudo cambiar el orden.');
    } finally {
      setSaving(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedCategories.length || saving) return;
    const previous = orderedCategories;
    const next = [...orderedCategories];
    [next[index], next[target]] = [next[target], next[index]];
    await saveOrder(next, previous);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || saving) return;
    const previous = orderedCategories;
    const oldIndex = previous.findIndex((category) => category.id === active.id);
    const newIndex = previous.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    void saveOrder(arrayMove(previous, oldIndex, newIndex), previous);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorías</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Postres"
            className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
            required
          />
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
        {error && <p className="text-red-600 text-base">{error}</p>}
        <p className="text-brand-950/60 text-xs">La cocina elegida se aplica a los productos actuales de la categoría y como cocina inicial para los nuevos.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedCategories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10 max-h-64 overflow-y-auto">
              {orderedCategories.map((category, index) => (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  index={index}
                  total={orderedCategories.length}
                  saving={saving}
                  onMove={move}
                  onRemove={remove}
                  kitchens={kitchens}
                  onKitchen={assignKitchen}
                />
              ))}
              {orderedCategories.length === 0 && (
                <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin categorías aún.</li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}

function SortableCategoryRow({
  category,
  index,
  total,
  saving,
  onMove,
  onRemove,
  kitchens,
  onKitchen,
}: {
  category: Category;
  index: number;
  total: number;
  saving: boolean;
  onMove: (index: number, direction: -1 | 1) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  kitchens: { id: string; name: string }[];
  onKitchen: (id: string, kitchenId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastrar para reordenar"
          className="shrink-0 cursor-grab touch-none text-brand-950/30 hover:text-brand-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="truncate">
          {category.name} <span className="text-brand-950/40">({category._count?.products ?? 0} productos)</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <select aria-label={`Cocina de ${category.name}`} className="max-w-32 rounded-lg border px-1 py-1 text-base" disabled={saving} value={category.kitchenId ?? ''} onChange={(e) => void onKitchen(category.id, e.target.value)}>
          <option value="">Sin cocina</option>
          {kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}
        </select>
        <button type="button" onClick={() => void onMove(index, -1)} disabled={index === 0 || saving} aria-label="Subir categoría" className="text-brand-950/50 hover:text-brand-500 disabled:opacity-25">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void onMove(index, 1)} disabled={index === total - 1 || saving} aria-label="Bajar categoría" className="text-brand-950/50 hover:text-brand-500 disabled:opacity-25">
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void onRemove(category.id)} className="ml-1 text-xs text-red-500 hover:text-red-600">
          Borrar
        </button>
      </span>
    </li>
  );
}
