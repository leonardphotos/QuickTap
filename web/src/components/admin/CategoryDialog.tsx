import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState(categories);

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

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedCategories.length || saving) return;
    const previous = orderedCategories;
    const next = [...orderedCategories];
    [next[index], next[target]] = [next[target], next[index]];
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
            className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10 max-h-64 overflow-y-auto">
          {orderedCategories.map((c, index) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {c.name} <span className="text-brand-950/40">({c._count?.products ?? 0} productos)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => void move(index, -1)} disabled={index === 0 || saving} aria-label="Subir categoría" className="text-brand-950/50 hover:text-brand-500 disabled:opacity-25">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void move(index, 1)} disabled={index === orderedCategories.length - 1 || saving} aria-label="Bajar categoría" className="text-brand-950/50 hover:text-brand-500 disabled:opacity-25">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button onClick={() => remove(c.id)} className="ml-1 text-red-500 hover:text-red-600 text-xs">
                  Borrar
                </button>
              </span>
            </li>
          ))}
          {orderedCategories.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin categorías aún.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
