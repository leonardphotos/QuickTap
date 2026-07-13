import { useState } from 'react';
import type { FormEvent } from 'react';
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
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto px-4 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10 max-h-64 overflow-y-auto">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {c.name} <span className="text-brand-950/40">({c._count?.products ?? 0} productos)</span>
              </span>
              <button onClick={() => remove(c.id)} className="text-red-500 hover:text-red-600 text-xs">
                Borrar
              </button>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin categorías aún.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
