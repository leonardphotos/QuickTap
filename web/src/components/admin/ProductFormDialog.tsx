import { lazy, Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import type { Category, Kitchen, ModifierCategory, Product, ProductVariant } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from './PhotoUploadField';

// Diferido: el editor de receta arrastra la cascada de precios y los diálogos de copiado, y solo
// lo abre quien de verdad entra a costear. Quien viene a corregir un precio no lo descarga.
const RecipePanel = lazy(() => import('./recipe/RecipeEditor').then((m) => ({ default: m.RecipePanel })));

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

/** Insumo de inventario marcado como envase (GET /inventory/packaging) — picker de "Vincular con stock". */
interface PackagingItem {
  id: string;
  name: string;
  packagingType: 'ENVASE' | 'CAJA' | 'BOLSA' | null;
  salePriceBase: string | null;
}

const PACKAGING_TYPE_LABELS: Record<string, string> = { ENVASE: 'Envase', CAJA: 'Caja', BOLSA: 'Bolsa' };

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
  sku: '',
  stockControlEnabled: false,
  stockQuantity: '',
  stockMinQuantity: '',
  expiryDate: '',
  packagingMode: 'NONE' as 'NONE' | 'FIXED' | 'INVENTORY',
  packagingFeeBase: '',
  packagingItemId: '',
  isStar: false,
  isPromo: false,
  isHouseSpecial: false,
  promoPriceEnabled: false,
  promoPrice: '',
  promoStartTime: '',
  promoEndTime: '',
  promoStartDate: '',
  promoEndDate: '',
};

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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
  const [recipeCascade, setRecipeCascade] = useState<{ costoReceta: string; foodCostReal: string } | null>(null);

  useEffect(() => {
    if (form.costSource !== 'RECIPE' || !product?.id) {
      setRecipeCascade(null);
      return;
    }
    api
      .get(`/inventory/recipes/${product.id}/cascade`)
      .then((res) => setRecipeCascade({ costoReceta: res.data.data.costoReceta, foodCostReal: res.data.data.foodCostReal }))
      .catch(() => setRecipeCascade(null));
  }, [form.costSource, product?.id]);
  const [justCreated, setJustCreated] = useState(false);

  const [pricingMode, setPricingMode] = useState<'SIMPLE' | 'VARIANTS'>('SIMPLE');
  const [promoDaysOfWeek, setPromoDaysOfWeek] = useState<number[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [linkedCategories, setLinkedCategories] = useState<ModifierCategory[]>([]);
  const [libraryCategories, setLibraryCategories] = useState<ModifierCategory[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  // Combo armable: los platos que lo componen. Persisten al instante (PUT del set completo),
  // mismo criterio que asociar/quitar categorias de modificadores.
  const [comboRows, setComboRows] = useState<{ componentProductId: string; name: string; quantity: number }[]>([]);
  // Pool escogible: "elige entre mín y máx platos de la lista". Vacíos = combo fijo de siempre.
  const [comboMin, setComboMin] = useState('');
  const [comboMax, setComboMax] = useState('');
  const [comboLibrary, setComboLibrary] = useState<{ id: string; name: string; categoryId: string }[]>([]);
  const [showComboPicker, setShowComboPicker] = useState(false);
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const canLinkPackagingStock = hasFeature(restaurant, 'inventoryBasic');
  const [tab, setTab] = useState<'general' | 'receta' | 'opciones' | 'avanzado'>('general');

  // Depende del ID del producto y no del objeto: cada vez que la pantalla de Productos recarga
  // su lista llega un `product` nuevo aunque sea el mismo plato, y con el objeto en las
  // dependencias eso rearmaba el formulario entero — te sacaba de la pestaña de Receta en cuanto
  // agregabas un ingrediente (la receta avisa del cambio, y ese aviso dispara la recarga), y de
  // paso descartaba cualquier campo editado y todavía sin guardar.
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
        sku: product.sku ?? '',
        stockControlEnabled: product.stockControlEnabled ?? false,
        stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : '',
        stockMinQuantity: product.stockMinQuantity != null ? String(product.stockMinQuantity) : '',
        expiryDate: product.expiryDate ?? '',
        packagingMode: product.packagingMode ?? 'NONE',
        packagingFeeBase: product.packagingFeeBase ?? '',
        packagingItemId: product.packagingItemId ?? '',
        isStar: product.isStar,
        isPromo: product.isPromo,
        isHouseSpecial: product.isHouseSpecial,
        promoPriceEnabled: product.promoPriceEnabled ?? false,
        promoPrice: product.promoPrice ?? '',
        promoStartTime: product.promoStartTime ?? '',
        promoEndTime: product.promoEndTime ?? '',
        promoStartDate: product.promoStartDate ?? '',
        promoEndDate: product.promoEndDate ?? '',
      });
      setPricingMode(product.pricingMode ?? 'SIMPLE');
      setVariants(product.variants ?? []);
      setLinkedCategories(product.modifierCategories ?? []);
      setPromoDaysOfWeek(product.promoDaysOfWeek ?? []);
    } else {
      setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
      setPricingMode('SIMPLE');
      setVariants([]);
      setLinkedCategories([]);
      setPromoDaysOfWeek([]);
      setJustCreated(false);
    }
    setShowCategoryPicker(false);
    setError(null);
    setTab('general');
  }, [open, product?.id]);

  /** La categoría por defecto de un producto nuevo, en cuanto haya categorías cargadas. */
  useEffect(() => {
    if (!open || product || form.categoryId) return;
    if (categories[0]) setForm((f) => ({ ...f, categoryId: categories[0].id }));
  }, [open, product, categories, form.categoryId]);

  useEffect(() => {
    if (!open) return;
    api.get('/modifier-categories').then((res) => setLibraryCategories(res.data.data));
    if (product) {
      api.get(`/products/${product.id}/combo`).then((res) => setComboRows(res.data.data)).catch(() => setComboRows([]));
      setComboMin(product.comboMinSelections?.toString() ?? '');
      setComboMax(product.comboMaxSelections?.toString() ?? '');
    } else {
      setComboRows([]);
      setComboMin('');
      setComboMax('');
    }
    if (canLinkPackagingStock) {
      api.get('/inventory/packaging').then((res) => setPackagingItems(res.data.data));
    }
  }, [open, canLinkPackagingStock]);

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
        sku: form.sku.trim() || null,
        stockControlEnabled: form.stockControlEnabled,
        stockQuantity: form.stockControlEnabled ? Number(form.stockQuantity) || 0 : null,
        stockMinQuantity: form.stockControlEnabled ? Number(form.stockMinQuantity) || 0 : null,
        // Cadena vacía = el backend la interpreta como "borrar la fecha".
        expiryDate: form.expiryDate,
        packagingMode: form.packagingMode,
        packagingFeeBase: form.packagingMode === 'FIXED' ? Number(form.packagingFeeBase) || 0 : null,
        packagingItemId: form.packagingMode === 'INVENTORY' ? form.packagingItemId || null : null,
        isStar: form.isStar,
        isPromo: form.isPromo,
        isHouseSpecial: form.isHouseSpecial,
        promoPriceEnabled: form.promoPriceEnabled,
        promoPrice: form.promoPriceEnabled && form.promoPrice ? Number(form.promoPrice) : null,
        promoStartTime: form.promoPriceEnabled && form.promoStartTime ? form.promoStartTime : null,
        promoEndTime: form.promoPriceEnabled && form.promoEndTime ? form.promoEndTime : null,
        promoDaysOfWeek: form.promoPriceEnabled ? promoDaysOfWeek : [],
        promoStartDate: form.promoPriceEnabled && form.promoStartDate ? form.promoStartDate : null,
        promoEndDate: form.promoPriceEnabled && form.promoEndDate ? form.promoEndDate : null,
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
    try {
      setError(null);
      await api.post(`/modifier-categories/${categoryId}/products`, { productId: product.id });
      const cat = libraryCategories.find((c) => c.id === categoryId);
      if (cat) setLinkedCategories((m) => [...m, cat]);
      setShowCategoryPicker(false);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo asociar la categoría.');
    }
  }

  async function dissociateCategory(categoryId: string) {
    if (!product) return;
    try {
      setError(null);
      await api.delete(`/modifier-categories/${categoryId}/products/${product.id}`);
      setLinkedCategories((m) => m.filter((c) => c.id !== categoryId));
    } catch (err: any) {
      // Antes esta llamada no tenía try/catch: un fallo (permiso, red, sesión vencida) se
      // tragaba entero y el botón de quitar la categoría "no hacía nada" — sin error, sin
      // que la categoría desapareciera, sin ninguna pista de qué pasó.
      setError(err.response?.data?.error ?? 'No se pudo quitar la categoría de este producto.');
    }
  }

  const availableToLink = libraryCategories.filter((c) => !linkedCategories.some((l) => l.id === c.id));

  async function persistCombo(
    rows: { componentProductId: string; name: string; quantity: number }[],
    pool?: { min: string; max: string },
  ) {
    if (!product) return;
    const min = (pool?.min ?? comboMin).trim();
    const max = (pool?.max ?? comboMax).trim();
    try {
      const res = await api.put(`/products/${product.id}/combo`, {
        components: rows.map((r) => ({ componentProductId: r.componentProductId, quantity: r.quantity })),
        // Pool escogible: se mandan siempre — vacíos van como null y el combo vuelve a fijo.
        minSelections: min === '' ? null : Number(min),
        maxSelections: max === '' ? null : Number(max),
      });
      setComboRows(res.data.data);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el combo.');
    }
  }

  async function openComboPicker() {
    if (comboLibrary.length === 0) {
      const res = await api.get('/products');
      setComboLibrary(
        (res.data.data as { id: string; name: string; categoryId: string }[])
          .filter((pr) => pr.id !== product?.id)
          .map((pr) => ({ id: pr.id, name: pr.name, categoryId: pr.categoryId })),
      );
    }
    setShowComboPicker((v) => !v);
  }

  /** Panel activo del lado derecho. La receta solo existe con inventario por receta en el plan. */
  const tabs = [
    { id: 'general' as const, label: 'General' },
    ...(canRecipeCost ? [{ id: 'receta' as const, label: 'Receta' }] : []),
    { id: 'opciones' as const, label: 'Modificadores' },
    { id: 'avanzado' as const, label: 'Avanzado' },
  ];

  const precioVisible = form.promoPriceEnabled && form.promoPrice ? form.promoPrice : form.price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0 max-h-[92vh]" hideClose>
        <form onSubmit={onSubmit} className="flex max-h-[92vh] flex-col">
          {/* Cabecera fija: el guardar no puede quedar al fondo de un formulario que ahora es
              mucho más largo — con la receta adentro, llegar al botón sería scrollear de más. */}
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-brand-950/[0.08] px-5 py-3.5">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">
                {product ? form.name || 'Editar producto' : 'Nuevo producto'}
              </DialogTitle>
              <p className="truncate text-xs font-light text-brand-950/40">
                {product
                  ? `${categories.find((c) => c.id === form.categoryId)?.name ?? 'Sin categoría'} · ${currencySymbol}${precioVisible || '0'}`
                  : 'Completa el nombre, la categoría y el precio para poder guardarlo.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TextureButton
                type="button"
                variant="minimal"
                size="default"
                className="!w-auto"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </TextureButton>
              <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
                {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
              </TextureButton>
            </div>
          </header>

          {error && <p className="shrink-0 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}
          {justCreated && (
            <p className="shrink-0 bg-emerald-50 px-5 py-2 text-xs font-medium text-emerald-700">
              ✅ Producto creado. Ya puedes armar su receta, sus modificadores y sus variantes.
            </p>
          )}

          {/* En pantalla ancha son dos columnas (foto y vista previa a la izquierda, datos a la
              derecha). En teléfono se apila, y el orden cambia a propósito: los campos van ANTES
              de la vista previa, porque si no, para escribir el nombre hay que bajar una pantalla
              entera de foto y tarjeta de ejemplo. */}
          <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5 lg:grid-cols-[17rem_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-6">
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              <PhotoUploadField value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} aiEnabled />
            </div>

            <aside className="order-3 space-y-4 lg:col-start-1 lg:row-start-2">
              <div className="rounded-xl border border-brand-950/10 p-3">
                <p className="mb-2 text-sm font-medium text-brand-950/70">Cómo se destaca</p>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.isStar} onChange={(e) => setForm({ ...form, isStar: e.target.checked })} />
                    ⭐ Producto estrella
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.isPromo} onChange={(e) => setForm({ ...form, isPromo: e.target.checked })} />
                    🔥 Promoción
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isHouseSpecial}
                      onChange={(e) => setForm({ ...form, isHouseSpecial: e.target.checked })}
                    />
                    👨‍🍳 Recomendación de la casa
                  </label>
                </div>
              </div>

              {/* Vista previa: la misma tarjeta que ve el cliente en el menú público. Sirve para
                  cachar de una que la foto quedó cortada o que la descripción no entra. */}
              <div className="rounded-xl border border-brand-950/10 p-3">
                <p className="mb-2 text-sm font-medium text-brand-950/70">Así lo ve el cliente</p>
                <div className="overflow-hidden rounded-xl border border-brand-950/[0.08]">
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-brand-950/[0.04] text-xs font-light text-brand-950/30">
                      Sin foto
                    </div>
                  )}
                  <div className="space-y-1 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-brand-950">{form.name || 'Nombre del producto'}</p>
                      <span className="shrink-0 text-sm font-semibold text-brand-950">
                        {currencySymbol}
                        {precioVisible || '0'}
                      </span>
                    </div>
                    {form.description && <p className="line-clamp-2 text-xs font-light text-brand-950/50">{form.description}</p>}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {form.isStar && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Estrella</span>}
                      {form.isPromo && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">Promo</span>}
                      {form.isHouseSpecial && (
                        <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-700">De la casa</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Los datos, repartidos en pestañas para que el formulario no sea una tira de treinta
                campos donde nadie encuentra nada. */}
            <section className="order-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
              <div className="-mx-1 mb-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <nav className="flex w-max gap-1 rounded-full bg-brand-950/[0.05] p-1">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        tab === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
              </div>

              {tab === 'general' && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Nombre</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Ej: Hamburguesa clásica"
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Categoría</span>
                      <select
                        value={form.categoryId}
                        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                        required
                      >
                        <option value="">Categoría…</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Precio(s): Simple (un solo precio) o Variantes (el cliente elige entre varias, cada una con su propio precio). */}
                  <div className="space-y-2.5 rounded-xl border border-brand-950/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-brand-950/70">Precio(s)</p>
                      <div className="flex overflow-hidden rounded-full border border-brand-950/15 text-xs font-medium">
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
                          className={`flex items-center gap-1 px-3 py-1 ${pricingMode === 'VARIANTS' ? 'bg-brand-500 text-white' : 'text-brand-950/60'}`}
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
                        className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
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

                  <label className="block text-sm">
                    <span className="text-xs text-brand-950/60">Descripción</span>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      placeholder="Lo que lee el cliente debajo del nombre."
                      className="mt-1 w-full resize-y rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="text-xs text-brand-950/60">Cocina</span>
                    <select
                      value={form.kitchenId}
                      onChange={(e) => setForm({ ...form, kitchenId: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                    >
                      <option value="">Sin cocina asignada</option>
                      {kitchens.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {tab === 'receta' && canRecipeCost && (
                <div className="space-y-3">
                  {!product ? (
                    <p className="rounded-xl bg-brand-950/[0.04] p-3 text-sm text-brand-950/50">
                      Guarda el producto primero: la receta se arma sobre un plato que ya existe.
                    </p>
                  ) : (
                    <>
                      {form.costSource !== 'RECIPE' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/70 p-3 text-[13px] text-amber-900">
                          <span>
                            El costo de este producto está puesto a mano. Puedes armar la receta igual, pero el costo no la usará
                            hasta que lo cambies.
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, costSource: 'RECIPE' })}
                            className="shrink-0 rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
                          >
                            Costear desde la receta
                          </button>
                        </div>
                      )}
                      <Suspense
                        fallback={<p className="py-8 text-center text-sm font-light text-brand-950/40">Cargando receta…</p>}
                      >
                        <RecipePanel productId={product.id} onSaved={onSaved} />
                      </Suspense>
                    </>
                  )}
                </div>
              )}

              {tab === 'opciones' && (
                <div className="space-y-3">
                  {/* Agregar modificadores: categorías reutilizables (armadas en "Modificadores") asociadas a este producto. */}
                  <div className="space-y-2 rounded-xl border border-brand-950/10 p-3">
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
                            className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
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
                          <p className="text-xs font-light text-brand-950/40">Ingredientes, sabores, cubiertos…</p>
                        ) : (
                          <ul className="divide-y divide-brand-950/10">
                            {linkedCategories.map((c) => (
                              <LinkedCategoryRow
                                key={c.id}
                                category={c}
                                productId={product!.id}
                                variants={pricingMode === 'VARIANTS' ? variants : []}
                                onDissociate={() => dissociateCategory(c.id)}
                              />
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  {/* Combo armable: este producto se vende a su precio, y al pedirlo cada plato
                      componente se arma con SUS propios modificadores (2 wokbox = dos armados
                      distintos) — tanto el cliente en el menu como el mesonero al tomar el pedido. */}
                  <div className="space-y-2 rounded-xl border border-brand-950/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-brand-950/70">
                        Combo armable {comboRows.length > 0 && `(${comboRows.reduce((a, r) => a + r.quantity, 0)} platos)`}
                      </p>
                      {product && (
                        <button type="button" onClick={openComboPicker} className="text-brand-500 hover:text-brand-600">
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {!product ? (
                      <p className="text-xs text-brand-950/50">Guarda el producto primero para convertirlo en combo.</p>
                    ) : (
                      <>
                        {showComboPicker && (
                          <select
                            autoFocus
                            value=""
                            onChange={(e) => {
                              const pr = comboLibrary.find((x) => x.id === e.target.value);
                              if (!pr) return;
                              setShowComboPicker(false);
                              void persistCombo([...comboRows, { componentProductId: pr.id, name: pr.name, quantity: 1 }]);
                            }}
                            className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                          >
                            <option value="">Elige el plato que compone el combo…</option>
                            {/* Agrupado por categoría, en el mismo orden en que están en la carta:
                                una carta larga en una lista plana obliga a recorrerla entera para
                                encontrar el plato. Se omiten las categorías que se quedan sin
                                platos disponibles (todos ya añadidos al combo). */}
                            {categories.map((cat) => {
                              const platos = comboLibrary.filter(
                                (pr) =>
                                  pr.categoryId === cat.id &&
                                  !comboRows.some((r) => r.componentProductId === pr.id),
                              );
                              if (platos.length === 0) return null;
                              return (
                                <optgroup key={cat.id} label={cat.name}>
                                  {platos.map((pr) => (
                                    <option key={pr.id} value={pr.id}>
                                      {pr.name}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                            {/* Red de seguridad: un plato cuya categoría no esté en la lista
                                (recién creada en otra pestaña, por ejemplo) no debe desaparecer. */}
                            {(() => {
                              const sueltos = comboLibrary.filter(
                                (pr) =>
                                  !categories.some((c) => c.id === pr.categoryId) &&
                                  !comboRows.some((r) => r.componentProductId === pr.id),
                              );
                              if (sueltos.length === 0) return null;
                              return (
                                <optgroup label="Otros">
                                  {sueltos.map((pr) => (
                                    <option key={pr.id} value={pr.id}>
                                      {pr.name}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })()}
                          </select>
                        )}
                        {comboRows.length === 0 ? (
                          <p className="text-xs font-light text-brand-950/40">
                            Ej: 2× Pizza mediana + 1× Refresco — cada pizza se arma al pedir con sus propios ingredientes.
                          </p>
                        ) : (
                          <ul className="divide-y divide-brand-950/10">
                            {comboRows.map((r) => (
                              <li key={r.componentProductId} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0 truncate text-brand-950">{r.name}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {/* En pool la cantidad fija no aplica: el cliente decide cuántos
                                      lleva de cada plato, así que el stepper se esconde. */}
                                  {!(comboMin.trim() !== '' || comboMax.trim() !== '') && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void persistCombo(
                                            comboRows.map((x) =>
                                              x.componentProductId === r.componentProductId
                                                ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                                                : x,
                                            ),
                                          )
                                        }
                                        disabled={r.quantity <= 1}
                                        className="h-6 w-6 rounded-full border border-brand-950/20 text-xs font-bold disabled:opacity-30"
                                      >
                                        −
                                      </button>
                                      <span className="w-4 text-center font-medium">{r.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void persistCombo(
                                            comboRows.map((x) =>
                                              x.componentProductId === r.componentProductId
                                                ? { ...x, quantity: Math.min(10, x.quantity + 1) }
                                                : x,
                                            ),
                                          )
                                        }
                                        className="h-6 w-6 rounded-full border border-brand-950/20 text-xs font-bold"
                                      >
                                        +
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void persistCombo(comboRows.filter((x) => x.componentProductId !== r.componentProductId))
                                    }
                                    className="ml-1 text-xs font-medium text-red-500 hover:text-red-600"
                                  >
                                    Quitar
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {comboRows.length > 0 && (
                          <div className="mt-2 border-t border-brand-950/10 pt-2">
                            {/* Pool escogible: con límites, la lista de arriba pasa de cantidades
                                fijas a "platos disponibles" y el cliente elige cuántos (mín–máx)
                                al precio del combo. Vacíos = combo fijo de siempre. */}
                            <span className="text-[11px] text-brand-950/40">
                              Platos a escoger (vacío = cantidades fijas)
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <label className="flex items-center gap-1.5 text-xs text-brand-950/60">
                                Mín.
                                <input
                                  value={comboMin}
                                  onChange={(e) => setComboMin(e.target.value.replace(/[^0-9]/g, ''))}
                                  onBlur={() => void persistCombo(comboRows)}
                                  placeholder="—"
                                  inputMode="numeric"
                                  className="w-14 rounded-lg border border-brand-950/15 px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-brand-950/60">
                                Máx.
                                <input
                                  value={comboMax}
                                  onChange={(e) => setComboMax(e.target.value.replace(/[^0-9]/g, ''))}
                                  onBlur={() => void persistCombo(comboRows)}
                                  placeholder="—"
                                  inputMode="numeric"
                                  className="w-14 rounded-lg border border-brand-950/15 px-2 py-1 text-sm"
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {tab === 'avanzado' && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {canRecipeCost ? (
                      <label className="block text-sm">
                        <span className="text-xs text-brand-950/60">De dónde sale el costo</span>
                        <select
                          value={form.costSource}
                          onChange={(e) => setForm({ ...form, costSource: e.target.value as 'MANUAL' | 'RECIPE' })}
                          className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                        >
                          <option value="MANUAL">Costo por unidad</option>
                          <option value="RECIPE">Desde receta</option>
                        </select>
                      </label>
                    ) : (
                      <div />
                    )}
                    {form.costSource === 'MANUAL' ? (
                      <label className="block text-sm">
                        <span className="text-xs text-brand-950/60">Costo en {currencySymbol} (opcional)</span>
                        <input
                          value={form.costBase}
                          onChange={(e) => setForm({ ...form, costBase: e.target.value })}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          min="0"
                          className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                        />
                      </label>
                    ) : recipeCascade ? (
                      <p className="self-center px-1 text-xs text-brand-950/60">
                        Costo actual: {currencySymbol}
                        {recipeCascade.costoReceta} · Food cost: {recipeCascade.foodCostReal}%. Ajústalo en la pestaña Receta.
                      </p>
                    ) : (
                      <p className="self-center px-1 text-xs text-brand-950/50">
                        {product?.id
                          ? 'Este producto todavía no tiene receta armada — hazlo en la pestaña Receta.'
                          : 'El costo se toma de la receta, que se arma después de crear el producto.'}
                      </p>
                    )}
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Tiempo de preparación (min)</span>
                      <input
                        value={form.prepTimeMinutes}
                        onChange={(e) => setForm({ ...form, prepTimeMinutes: e.target.value })}
                        placeholder="Opcional"
                        type="number"
                        step="1"
                        min="0"
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">SKU</span>
                      <input
                        value={form.sku}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                        placeholder="Opcional"
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                      />
                    </label>
                  </div>

                  {pricingMode === 'SIMPLE' && (
                    <div className="space-y-2.5 rounded-xl border border-brand-950/10 p-3">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-brand-950/70">⏰ Promoción por tiempo</span>
                        <input
                          type="checkbox"
                          checked={form.promoPriceEnabled}
                          onChange={(e) => setForm({ ...form, promoPriceEnabled: e.target.checked })}
                        />
                      </label>
                      {form.promoPriceEnabled && (
                        <div className="space-y-2.5">
                          <p className="text-xs font-light text-brand-950/45">
                            Precio especial que solo aplica dentro de la ventana que definas abajo (hora, días y/o fechas — las
                            que dejes cargadas deben cumplirse todas a la vez; deja algo vacío para no restringir por ese lado).
                          </p>
                          <input
                            value={form.promoPrice}
                            onChange={(e) => setForm({ ...form, promoPrice: e.target.value })}
                            placeholder={`Precio de promoción en ${currencySymbol}`}
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[11px] text-brand-950/40">Desde la hora</span>
                              <input
                                value={form.promoStartTime}
                                onChange={(e) => setForm({ ...form, promoStartTime: e.target.value })}
                                type="time"
                                className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-brand-950/40">Hasta la hora</span>
                              <input
                                value={form.promoEndTime}
                                onChange={(e) => setForm({ ...form, promoEndTime: e.target.value })}
                                type="time"
                                className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                          <div>
                            <span className="text-[11px] text-brand-950/40">Días de la semana (ninguno = todos)</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {DAY_LABELS.map((label, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    setPromoDaysOfWeek((days) =>
                                      days.includes(idx) ? days.filter((d) => d !== idx) : [...days, idx],
                                    )
                                  }
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                                    promoDaysOfWeek.includes(idx)
                                      ? 'border-brand-500 bg-brand-500 text-white'
                                      : 'border-brand-950/15 text-brand-950/60'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[11px] text-brand-950/40">Desde la fecha</span>
                              <input
                                value={form.promoStartDate}
                                onChange={(e) => setForm({ ...form, promoStartDate: e.target.value })}
                                type="date"
                                className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-brand-950/40">Hasta la fecha</span>
                              <input
                                value={form.promoEndDate}
                                onChange={(e) => setForm({ ...form, promoEndDate: e.target.value })}
                                type="date"
                                className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border border-brand-950/10 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.stockControlEnabled}
                        onChange={(e) => setForm({ ...form, stockControlEnabled: e.target.checked })}
                      />
                      <span className="font-medium text-brand-950/70">Controlar stock</span>
                    </label>
                    {form.stockControlEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                          <span className="text-xs text-brand-950/60">Cantidad en stock</span>
                          <input
                            value={form.stockQuantity}
                            onChange={(e) => setForm({ ...form, stockQuantity: e.target.value.replace(/[^0-9]/g, '') })}
                            placeholder="0"
                            type="number"
                            step="1"
                            min="0"
                            className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-xs text-brand-950/60">Avisar al llegar a</span>
                          <input
                            value={form.stockMinQuantity}
                            onChange={(e) => setForm({ ...form, stockMinQuantity: e.target.value.replace(/[^0-9]/g, '') })}
                            placeholder="0"
                            type="number"
                            step="1"
                            min="0"
                            className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    )}
                    {/* Independiente del control de stock: un producto puede caducar aunque
                        no se lleve la cuenta de cuántos quedan. */}
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Fecha de caducidad (opcional)</span>
                      <input
                        value={form.expiryDate}
                        onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                        type="date"
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="space-y-3 rounded-xl border border-brand-950/10 p-3">
                    <p className="text-sm font-medium text-brand-950">
                      Envase <span className="font-normal text-brand-950/40">— solo se cobra en pedidos de Delivery/Pickup</span>
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {(['NONE', 'FIXED', 'INVENTORY'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setForm({ ...form, packagingMode: mode })}
                          className={`rounded-full border px-3 py-1.5 transition-colors ${
                            form.packagingMode === mode
                              ? 'border-brand-500 bg-brand-500 text-white'
                              : 'border-brand-950/15 text-brand-950/70 hover:border-brand-950/30'
                          }`}
                        >
                          {mode === 'NONE' ? 'Ninguno' : mode === 'FIXED' ? 'Precio propio' : 'Vincular con stock'}
                        </button>
                      ))}
                    </div>
                    {form.packagingMode === 'FIXED' && (
                      <input
                        value={form.packagingFeeBase}
                        onChange={(e) => setForm({ ...form, packagingFeeBase: e.target.value.replace(/[^0-9.]/g, '') })}
                        placeholder={`Precio del envase (${currencySymbol})`}
                        className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    )}
                    {form.packagingMode === 'INVENTORY' &&
                      (canLinkPackagingStock ? (
                        packagingItems.length > 0 ? (
                          <select
                            value={form.packagingItemId}
                            onChange={(e) => setForm({ ...form, packagingItemId: e.target.value })}
                            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                          >
                            <option value="">Elige un insumo de envase…</option>
                            {packagingItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({PACKAGING_TYPE_LABELS[item.packagingType ?? '']})
                                {item.salePriceBase ? ` — ${currencySymbol}${item.salePriceBase}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs font-light text-brand-950/40">
                            Aún no tienes insumos marcados como envase. Créalos desde Inventario → Insumos, marcando "Es un
                            envase para delivery".
                          </p>
                        )
                      ) : (
                        <p className="text-xs font-light text-brand-950/40">
                          Este plan no incluye Inventario — usa "Precio propio" o mejora tu plan para vincular con stock.
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fila de una categoría de modificadores ya asociada a este producto. Si la categoría permite
 * varias opciones, deja sobreescribir su límite de selecciones solo para este producto puntual
 * (ej. la categoría "Salsas" es máx. 4 en general, pero este producto la deja en máx. 2). */
function LinkedCategoryRow({
  category,
  productId,
  variants,
  onDissociate,
}: {
  category: ModifierCategory;
  productId: string;
  /** Tamaños del producto. Vacío = producto de precio simple, no hay nada que acotar. */
  variants: ProductVariant[];
  onDissociate: () => void;
}) {
  const [maxSelections, setMaxSelectionsInput] = useState(category.maxSelections?.toString() ?? '');
  const [freeQuantity, setFreeQuantityInput] = useState(category.freeQuantity?.toString() ?? '');
  // Vacío = el grupo va en todos los tamaños. Es el valor de siempre y el que conviene por
  // defecto: acotar es la excepción ("Término de la carne" solo en la doble y la triple).
  const [variantIds, setVariantIds] = useState<string[]>(category.variantIds ?? []);
  const [guardandoTamanos, setGuardandoTamanos] = useState(false);

  useEffect(() => setMaxSelectionsInput(category.maxSelections?.toString() ?? ''), [category.id, category.maxSelections]);
  useEffect(() => setFreeQuantityInput(category.freeQuantity?.toString() ?? ''), [category.id, category.freeQuantity]);
  useEffect(() => setVariantIds(category.variantIds ?? []), [category.id, category.variantIds]);

  async function saveOverride() {
    const n = maxSelections.trim() === '' ? null : Number(maxSelections);
    if (n === (category.maxSelections ?? null)) return;
    await api.patch(`/modifier-categories/${category.id}/products/${productId}`, { maxSelectionsOverride: n });
  }

  async function saveFreeQuantity() {
    const n = freeQuantity.trim() === '' || Number(freeQuantity) === 0 ? null : Number(freeQuantity);
    if (n === (category.freeQuantity ?? null)) return;
    await api.patch(`/modifier-categories/${category.id}/products/${productId}`, { freeQuantity: n });
  }

  async function guardarTamanos(ids: string[]) {
    setVariantIds(ids);
    setGuardandoTamanos(true);
    try {
      await api.patch(`/modifier-categories/${category.id}/products/${productId}`, { variantIds: ids });
    } finally {
      setGuardandoTamanos(false);
    }
  }

  return (
    <li className="py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-brand-950 truncate">{category.name}</span>
        <button type="button" onClick={onDissociate} className="text-brand-950/30 hover:text-red-500 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {category.allowMultiple && (
        <div className="flex flex-wrap gap-3">
          <label className="block max-w-[10rem]">
            <span className="text-[11px] text-brand-950/40">Límite para este producto</span>
            <input
              value={maxSelections}
              onChange={(e) => setMaxSelectionsInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveOverride}
              placeholder="Usar el de la categoría"
              inputMode="numeric"
              className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1"
            />
          </label>
          {/* Incluidos sin costo EN ESTE PLATO: las primeras N unidades del grupo van a $0
              aunque tengan precio, y de la N+1 en adelante se cobran (las gratis se asignan
              a las más baratas — misma regla del servidor). Vacío o 0 = todas se cobran. */}
          <label className="block max-w-[10rem]">
            <span className="text-[11px] text-brand-950/40">Gratis (incluidos)</span>
            <input
              value={freeQuantity}
              onChange={(e) => setFreeQuantityInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveFreeQuantity}
              placeholder="0 = se cobran todos"
              inputMode="numeric"
              className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1"
            />
          </label>
        </div>
      )}

      {/* En qué tamaños se ofrece. Solo tiene sentido con variantes: en un producto de precio
          simple no hay entre qué elegir. Se guarda al tocar, como el resto de esta sección. */}
      {variants.length > 0 && (
        <div>
          <span className="text-[11px] text-brand-950/40">
            ¿En qué tamaños? {guardandoTamanos && <span className="text-brand-500">guardando…</span>}
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void guardarTamanos([])}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                variantIds.length === 0
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-brand-950/15 text-brand-950/60'
              }`}
            >
              Todos
            </button>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() =>
                  void guardarTamanos(
                    variantIds.includes(v.id) ? variantIds.filter((x) => x !== v.id) : [...variantIds, v.id],
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  variantIds.includes(v.id)
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-brand-950/15 text-brand-950/60'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
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
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center">
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
        <button
          type="button"
          onClick={() => onSave(variant.id, { isAvailable: !variant.isAvailable })}
          title={variant.isAvailable ? 'Ocultar' : 'Mostrar'}
          className={variant.isAvailable ? 'text-brand-500' : 'text-brand-950/25'}
        >
          {variant.isAvailable ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
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
