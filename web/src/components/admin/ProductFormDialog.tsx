import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { Category, Kitchen, Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from './PhotoUploadField';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  kitchens: Kitchen[];
  product: Product | null;
  currencySymbol: string;
  onSaved: () => void;
}

const emptyForm = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  kitchenId: '',
  photoUrl: '' as string | null,
  prepTimeMinutes: '',
  isStar: false,
  isPromo: false,
  isHouseSpecial: false,
};

export function ProductFormDialog({ open, onOpenChange, categories, kitchens, product, currencySymbol, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        description: product.description ?? '',
        price: product.price,
        categoryId: product.categoryId,
        kitchenId: product.kitchenId ?? '',
        photoUrl: product.photoUrl ?? null,
        prepTimeMinutes: product.prepTimeMinutes != null ? String(product.prepTimeMinutes) : '',
        isStar: product.isStar,
        isPromo: product.isPromo,
        isHouseSpecial: product.isHouseSpecial,
      });
    } else {
      setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
    }
    setError(null);
  }, [open, product, categories]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        kitchenId: form.kitchenId || null,
        price: Number(form.price),
        photoUrl: form.photoUrl || undefined,
        description: form.description || undefined,
        prepTimeMinutes: form.prepTimeMinutes ? Number(form.prepTimeMinutes) : undefined,
        isStar: form.isStar,
        isPromo: form.isPromo,
        isHouseSpecial: form.isHouseSpecial,
      };
      if (product) {
        await api.patch(`/products/${product.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} />

          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              required
            />
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              required
            >
              <option value="">Categoría…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder={`Precio en ${currencySymbol}`}
              type="number"
              step="0.01"
              min="0"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              required
            />
            <input
              value={form.prepTimeMinutes}
              onChange={(e) => setForm({ ...form, prepTimeMinutes: e.target.value })}
              placeholder="Tiempo de preparación (min, opcional)"
              type="number"
              step="1"
              min="0"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción (opcional)"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          <label className="block text-sm">
            <span className="text-brand-950/60 text-xs">Cocina</span>
            <select
              value={form.kitchenId}
              onChange={(e) => setForm({ ...form, kitchenId: e.target.value })}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              <option value="">Sin cocina asignada</option>
              {kitchens.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.isStar} onChange={(e) => setForm({ ...form, isStar: e.target.checked })} />
              Producto Estrella
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.isPromo} onChange={(e) => setForm({ ...form, isPromo: e.target.checked })} />
              Promoción
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.isHouseSpecial}
                onChange={(e) => setForm({ ...form, isHouseSpecial: e.target.checked })}
              />
              Recomendación de la Casa
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto px-4 disabled:opacity-50">
            {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
