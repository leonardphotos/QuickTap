import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import type { Category, Kitchen, ModifierCategory, Product, ProductVariant } from '@/types';
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
  /** Tras crear un producto nuevo, el diálogo se queda abierto en modo edición para poder agregar modificadores/variantes de inmediato. */
  onCreated: (product: Product) => void;
}

const emptyForm = {
  name: '',
  description: '',
  price: '',
  costSource: 'MANUAL' as 'MANUAL' | 'RECIPE',
  costBase: '',
  categoryId: '',
  kitchenId: '',
  photoUrl: '' as string | null,
  prepTimeMinutes: '',
  isStar: false,
  isPromo: false,
  isHouseSpecial: false,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  categories,
  kitchens,
  product,
  currencySymbol,
  onSaved,
  onCreated,
}: Props) {
  const { restaurant } = useAuth();
  const canRecipeCost = hasFeature(restaurant, 'inventoryRecipe');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  const [pricingMode, setPricingMode] = useState<'SIMPLE' | 'VARIANTS'>('SIMPLE');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [linkedCategories, setLinkedCategories] = useState<ModifierCategory[]>([]);
  const [libraryCategories, setLibraryCategories] = useState<ModifierCategory[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        description: product.description ?? '',
        price: product.price,
        costSource: product.costSource,
        costBase: product.costBase ?? '',
        categoryId: product.categoryId,
        kitchenId: product.kitchenId ?? '',
        photoUrl: product.photoUrl ?? null,
        prepTimeMinutes: product.prepTimeMinutes != null ? String(product.prepTimeMinutes) : '',
        isStar: product.isStar,
        isPromo: product.isPromo,
        isHouseSpecial: product.isHouseSpecial,
      });
      setPricingMode(product.pricingMode ?? 'SIMPLE');
      setVariants(product.variants ?? []);
      setLinkedCategories(product.modifierCategories ?? []);
    } else {
      setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
      setPricingMode('SIMPLE');
      setVariants([]);
      setLinkedCategories([]);
      setJustCreated(false);
    }
    setShowCategoryPicker(false);
    setError(null);
  }, [open, product, categories]);

  useEffect(() => {
    if (!open) return;
    api.get('/modifier-categories').then((res) => setLibraryCategories(res.data.data));
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        kitchenId: form.kitchenId || null,
        price: Number(form.price) || 0,
        pricingMode,
        costSource: form.costSource,
        costBase: form.costSource === 'MANUAL' && form.costBase ? Number(form.costBase) : undefined,
        photoUrl: form.photoUrl === null ? null : form.photoUrl || undefined,
        description: form.description || undefined,
        prepTimeMinutes: form.prepTimeMinutes ? Number(form.prepTimeMinutes) : undefined,
        isStar: form.isStar,
        isPromo: form.isPromo,
        isHouseSpecial: form.isHouseSpecial,
      };
      if (product) {
        await api.patch(`/products/${product.id}`, payload);
        onOpenChange(false);
        onSaved();
      } else {
        const res = await api.post('/products', payload);
        onSaved();
        onCreated(res.data.data);
        setJustCreated(true);
        setTimeout(() => setJustCreated(false), 5000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    if (!product) return;
    const res = await api.post(`/products/${product.id}/variants`, { name: 'Nueva variante', priceBase: 0 });
    setVariants((v) => [...v, res.data.data]);
  }

  async function patchVariant(id: string, patch: Record<string, unknown>) {
    if (!product) return;
    const res = await api.patch(`/products/${product.id}/variants/${id}`, patch);
    setVariants((v) => v.map((x) => (x.id === id ? res.data.data : x)));
  }

  async function removeVariant(id: string) {
    if (!product) return;
    await api.delete(`/products/${product.id}/variants/${id}`);
    setVariants((v) => v.filter((x) => x.id !== id));
  }

  async function associateCategory(categoryId: string) {
    if (!product || !categoryId) return;
    await api.post(`/modifier-categories/${categoryId}/products`, { productId: product.id });
    const cat = libraryCategories.find((c) => c.id === categoryId);
    if (cat) setLinkedCategories((m) => [...m, cat]);
    setShowCategoryPicker(false);
  }

  async function dissociateCategory(categoryId: string) {
    if (!product) return;
    await api.delete(`/modifier-categories/${categoryId}/products/${product.id}`);
    setLinkedCategories((m) => m.filter((c) => c.id !== categoryId));
  }

  const availableToLink = libraryCategories.filter((c) => !linkedCategories.some((l) => l.id === c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {justCreated && (
            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              ✅ Producto creado. Ahora puedes agregar modificadores o variantes abajo.
            </p>
          )}
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
            {canRecipeCost ? (
              <select
                value={form.costSource}
                onChange={(e) => setForm({ ...form, costSource: e.target.value as 'MANUAL' | 'RECIPE' })}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              >
                <option value="MANUAL">Costo por unidad</option>
                <option value="RECIPE">Desde receta</option>
              </select>
            ) : (
              <div />
            )}
            {form.costSource === 'MANUAL' ? (
              <input
                value={form.costBase}
                onChange={(e) => setForm({ ...form, costBase: e.target.value })}
                placeholder={`Costo en ${currencySymbol} (opcional)`}
                type="number"
                step="0.01"
                min="0"
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            ) : (
              <p className="text-xs text-brand-950/50 self-center px-1">
                El costo se toma de la receta armada en Inventario → Recetas.
              </p>
            )}
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

          {/* Precio(s): Simple (un solo precio) o Variantes (el cliente elige entre varias, cada una con su propio precio). */}
          <div className="rounded-xl border border-brand-950/10 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium text-brand-950/70">Precio(s)</p>
              <div className="flex rounded-full border border-brand-950/15 overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setPricingMode('SIMPLE')}
                  className={`px-3 py-1 ${pricingMode === 'SIMPLE' ? 'bg-brand-500 text-white' : 'text-brand-950/60'}`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode('VARIANTS')}
                  className={`px-3 py-1 flex items-center gap-1 ${pricingMode === 'VARIANTS' ? 'bg-brand-500 text-white' : 'text-brand-950/60'}`}
                >
                  Variantes {variants.length > 0 && `(${variants.length})`}
                </button>
              </div>
            </div>

            {pricingMode === 'SIMPLE' ? (
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder={`Precio en ${currencySymbol}`}
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                required
              />
            ) : !product ? (
              <p className="text-xs text-brand-950/50">Guarda el producto primero para agregar las variantes.</p>
            ) : (
              <div className="space-y-2">
                {variants.map((v) => (
                  <VariantRow key={v.id} variant={v} symbol={currencySymbol} onSave={patchVariant} onRemove={removeVariant} />
                ))}
                <button
                  type="button"
                  onClick={addVariant}
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
                >
                  <Plus className="h-4 w-4" /> Agregar variante
                </button>
              </div>
            )}
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

          {/* Agregar modificadores: categorías reutilizables (armadas en "Modificadores") asociadas a este producto. */}
          <div className="rounded-xl border border-brand-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-brand-950/70">
                Agregar modificadores {linkedCategories.length > 0 && `(${linkedCategories.length})`}
              </p>
              {product && (
                <button
                  type="button"
                  onClick={() => setShowCategoryPicker((s) => !s)}
                  className="text-brand-500 hover:text-brand-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {!product ? (
              <p className="text-xs text-brand-950/50">Guarda el producto primero para agregar modificadores.</p>
            ) : (
              <>
                {showCategoryPicker && (
                  <select
                    autoFocus
                    value=""
                    onChange={(e) => associateCategory(e.target.value)}
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">Elige una categoría de modificadores…</option>
                    {availableToLink.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {linkedCategories.length === 0 ? (
                  <p className="text-xs text-brand-950/40 font-light">Ingredientes, sabores, cubiertos…</p>
                ) : (
                  <ul className="divide-y divide-brand-950/10">
                    {linkedCategories.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="text-brand-950 truncate">{c.name}</span>
                        <button
                          type="button"
                          onClick={() => dissociateCategory(c.id)}
                          className="text-brand-950/30 hover:text-red-500 shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

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
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
          </TextureButton>
          {!product && !justCreated && (
            <p className="text-xs text-brand-950/40 -mt-1">
              Después de crear el producto podrás agregarle modificadores y variantes.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariantRow({
  variant,
  symbol,
  onSave,
  onRemove,
}: {
  variant: ProductVariant;
  symbol: string;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(variant.priceBase);
  const [packagingFee, setPackagingFee] = useState(variant.packagingFeeBase ?? '');
  const [showPackaging, setShowPackaging] = useState(!!variant.packagingFeeBase);

  useEffect(() => {
    setName(variant.name);
    setPrice(variant.priceBase);
    setPackagingFee(variant.packagingFeeBase ?? '');
  }, [variant]);

  return (
    <div className="rounded-lg border border-brand-950/10 p-2 space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== variant.name && onSave(variant.id, { name: name.trim() })}
          className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 min-w-0"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-brand-950/40">{symbol}</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => onSave(variant.id, { priceBase: Number(price) || 0 })}
            className="w-16 text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
          />
        </div>
        <button type="button" onClick={() => onRemove(variant.id)} className="text-brand-950/30 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!showPackaging ? (
        <button
          type="button"
          onClick={() => setShowPackaging(true)}
          className="flex items-center gap-1 text-xs font-medium text-brand-950/50 bg-brand-950/[0.05] rounded-full px-2.5 py-1"
        >
          <Plus className="h-3 w-3" /> Precio de embalaje
        </button>
      ) : (
        <label className="block text-xs max-w-[10rem]">
          <span className="text-brand-950/40">Precio de embalaje ({symbol})</span>
          <input
            value={packagingFee}
            onChange={(e) => setPackagingFee(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => onSave(variant.id, { packagingFeeBase: packagingFee ? Number(packagingFee) : undefined })}
            className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1"
          />
        </label>
      )}
    </div>
  );
}
