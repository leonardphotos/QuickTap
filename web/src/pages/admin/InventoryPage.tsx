import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AlertTriangle, FileSpreadsheet, Plus, Printer, Trash2, Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import type { Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import { UNIT_LABELS, SUB_UNITS } from '@/utils/inventoryUnits';

interface InventoryCategory {
  id: string;
  name: string;
  priority: number;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
  pricePerUnitBase: string | null;
  photoUrl?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  // Envase: no nulo = este insumo se puede vincular como envase de un producto.
  packagingType?: 'ENVASE' | 'CAJA' | 'BOLSA' | null;
  salePriceBase?: string | null;
}

const PACKAGING_TYPE_LABELS: Record<string, string> = { ENVASE: 'Envase', CAJA: 'Caja', BOLSA: 'Bolsa' };

const emptyForm = {
  name: '',
  unit: '',
  subUnit: '',
  quantity: '',
  minQuantity: '',
  price: '',
  priceCurrency: 'BASE' as 'BASE' | 'BS',
  photoUrl: null as string | null,
  categoryId: '',
  isPackaging: false,
  packagingType: 'ENVASE' as 'ENVASE' | 'CAJA' | 'BOLSA',
  salePrice: '',
};

/** Inventario: insumos con stock directo ("normal", Pro+), o por receta vinculada al producto (solo Premium). */
export default function InventoryPage() {
  const { restaurant } = useAuth();
  const canRecipes = hasFeature(restaurant, 'inventoryRecipe');
  // Casa Matriz y Transferencias son de Plan Sucursales — solo aparecen desde la sede
  // principal (una sucursal no puede activar Casa Matriz ni ver la pestaña).
  const isMain = !restaurant?.parentRestaurantId;
  const showCasaMatriz = isMain && !!restaurant?.casaMatrizEnabled;
  const TABS = [
    { id: 'insumos', label: 'Insumos (normal)' },
    ...(canRecipes ? [{ id: 'recetas', label: 'Recetas' }] : []),
    { id: 'stock', label: 'Stock de productos' },
    ...(showCasaMatriz ? [{ id: 'casa-matriz', label: 'Casa Matriz' }] : []),
    { id: 'transferencias', label: 'Transferencia de insumos' },
  ] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('insumos');
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [casaMatrizItems, setCasaMatrizItems] = useState<InventoryItem[] | null>(null);

  function loadItems() {
    api.get('/inventory', { params: { locationScope: 'LOCAL' } }).then((res) => setItems(res.data.data));
  }

  function loadCasaMatrizItems() {
    api.get('/inventory', { params: { locationScope: 'CASA_MATRIZ' } }).then((res) => setCasaMatrizItems(res.data.data));
  }

  function loadCategories() {
    api.get('/inventory/categories').then((res) => setCategories(res.data.data));
  }

  useEffect(loadItems, []);
  useEffect(loadCategories, []);
  useEffect(() => {
    if (showCasaMatriz) loadCasaMatrizItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCasaMatriz]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Inventario</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          {canRecipes
            ? 'Insumos con stock directo, o por receta: vinculados a un producto del menú para descontar el stock solo al vender.'
            : 'Insumos con stock directo. Para descontar automáticamente al vender según receta, actualiza al plan Premium.'}
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

      {tab === 'insumos' && (
        <InsumosTab
          locationScope="LOCAL"
          items={items}
          categories={categories}
          onChanged={loadItems}
          onCategoriesChanged={loadCategories}
        />
      )}
      {tab === 'recetas' && canRecipes && <RecetasTab insumos={items ?? []} />}
      {tab === 'stock' && <StockTab />}
      {tab === 'casa-matriz' && (
        <InsumosTab
          locationScope="CASA_MATRIZ"
          items={casaMatrizItems}
          categories={categories}
          onChanged={loadCasaMatrizItems}
          onCategoriesChanged={loadCategories}
          showModifierLinkToggle={false}
        />
      )}
      {tab === 'transferencias' && <TransferenciasTab />}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Stock de productos: contador simple por producto (independiente de insumos/receta),
//  disponible para todos los planes.
// -----------------------------------------------------------------------------

function StockTab() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data.data));
  }, []);

  async function patchProduct(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await api.patch(`/products/${id}`, patch);
      setProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...res.data.data } : p)) ?? null);
    } finally {
      setSavingId(null);
    }
  }

  if (!products) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  // Agrupa por la categoría del menú del producto (Category, no InventoryCategory) — ya
  // existe en cada Product, no hace falta un concepto nuevo para esta pestaña.
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.category?.name ?? 'Sin categoría';
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-brand-950/60 font-light">
        Activa el control de stock por producto: al llegar a 0 se marca como agotado en el menú público.
      </p>
      {[...groups.entries()].map(([categoryName, group]) => (
        <div key={categoryName} className="space-y-2">
          <h3 className="text-xs font-semibold text-brand-950/50 uppercase tracking-wide px-1">{categoryName}</h3>
          <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">
            {group.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-brand-950/[0.06] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">{p.name}</p>
                    <label className="flex items-center gap-1.5 text-xs text-brand-950/60 mt-0.5">
                      <input
                        type="checkbox"
                        checked={p.stockControlEnabled ?? false}
                        onChange={(e) =>
                          patchProduct(p.id, {
                            stockControlEnabled: e.target.checked,
                            stockQuantity: e.target.checked ? p.stockQuantity ?? 0 : null,
                          })
                        }
                      />
                      Controlar stock
                    </label>
                  </div>
                </div>
                {p.stockControlEnabled && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={p.stockQuantity ?? 0}
                      disabled={savingId === p.id}
                      onBlur={(e) => patchProduct(p.id, { stockControlEnabled: true, stockQuantity: Number(e.target.value) || 0 })}
                      className="w-20 border border-brand-950/15 rounded-lg px-2 py-1 text-sm text-right"
                    />
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        (p.stockQuantity ?? 0) <= 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {(p.stockQuantity ?? 0) <= 0 ? 'Agotado' : 'En stock'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Insumos (normal): stock directo, tal cual estaba antes.
// -----------------------------------------------------------------------------

function InsumosTab({
  locationScope,
  items,
  categories,
  onChanged,
  onCategoriesChanged,
  showModifierLinkToggle = true,
}: {
  /** "LOCAL" (Insumos de siempre) o "CASA_MATRIZ" (ventana aparte, ver InventoryPage). */
  locationScope: 'LOCAL' | 'CASA_MATRIZ';
  items: InventoryItem[] | null;
  categories: InventoryCategory[];
  onChanged: () => void;
  onCategoriesChanged: () => void;
  /** El interruptor de "Descontar insumos por modificador" es un ajuste único del
   * restaurante — solo tiene sentido mostrarlo una vez, en la pestaña Insumos normal. */
  showModifierLinkToggle?: boolean;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingList, setPrintingList] = useState(false);
  const [printSent, setPrintSent] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Interruptor del vínculo modificador -> insumo.
  const { refresh } = useAuth();
  const linkEnabled = !!restaurant?.modifierInventoryLinkEnabled;
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function toggleModifierLink() {
    setSavingLink(true);
    setLinkError(null);
    try {
      await api.patch('/restaurant', { modifierInventoryLinkEnabled: !linkEnabled });
      // Recarga /auth/me para que el nuevo valor llegue a todas las pantallas
      // (el editor de modificadores lo lee del mismo contexto).
      await refresh();
    } catch {
      setLinkError('No se pudo cambiar el ajuste. Intenta de nuevo.');
    } finally {
      setSavingLink(false);
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    const res = await api.post('/inventory/categories', { name: newCategoryName.trim() });
    onCategoriesChanged();
    setForm((f) => ({ ...f, categoryId: res.data.data.id }));
    setNewCategoryName('');
    setAddingCategory(false);
  }

  async function printInsumosList() {
    setPrintingList(true);
    try {
      await api.post('/inventory/print-list');
      setPrintSent(true);
      setTimeout(() => setPrintSent(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar la lista a la estación de impresión.');
    } finally {
      setPrintingList(false);
    }
  }

  async function downloadImportTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await api.get('/inventory/import-template', { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = 'plantilla-insumos.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('No se pudo generar la plantilla. Intenta de nuevo.');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/inventory/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.data);
      onChanged();
      onCategoriesChanged();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      unit: item.unit,
      subUnit: item.unit,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      price: '',
      priceCurrency: 'BASE',
      photoUrl: item.photoUrl ?? null,
      categoryId: item.categoryId ?? '',
      isPackaging: !!item.packagingType,
      packagingType: item.packagingType ?? 'ENVASE',
      salePrice: item.salePriceBase ?? '',
    });
  }

  const subUnitOptions = SUB_UNITS[form.unit] ?? [];

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const subUnit = subUnitOptions.find((u) => u.value === form.subUnit);
      const toBase = subUnit?.toBase ?? 1;
      const payload = {
        name: form.name,
        unit: form.unit,
        quantity: (Number(form.quantity) || 0) * toBase,
        minQuantity: (Number(form.minQuantity) || 0) * toBase,
        price: form.price ? Number(form.price) : undefined,
        priceCurrency: form.priceCurrency,
        photoUrl: form.photoUrl,
        categoryId: form.categoryId || null,
        packagingType: form.isPackaging ? form.packagingType : null,
        salePrice: form.isPackaging ? Number(form.salePrice) || 0 : null,
        locationScope,
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

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = (items ?? []).map((i) => i.id);
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }

  async function bulkRemove() {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} insumo${selected.size === 1 ? '' : 's'} seleccionado${selected.size === 1 ? '' : 's'}?`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/inventory/bulk-delete', { ids: Array.from(selected) });
      setSelected(new Set());
      onChanged();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Interruptor del vínculo modificador -> insumo. Se deja arriba de todo
          porque cambia el comportamiento de TODA la venta: con esto apagado, los
          modificadores no tocan el stock aunque tengan el insumo configurado. Ajuste único
          del restaurante — no se repite en la ventana de Casa Matriz. */}
      {showModifierLinkToggle && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-950">Descontar insumos por modificador</p>
            <p className="text-xs text-brand-950/50 font-light mt-0.5">
              Cuando está activo, cada modificador que tenga un insumo vinculado (ej. "Extra queso" → 30 gr de Queso)
              descuenta del inventario al servirse el pedido. Apagado, la configuración se conserva pero no toca el stock.
            </p>
            {linkError && <p className="text-xs text-red-600 mt-1">{linkError}</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={linkEnabled}
            onClick={toggleModifierLink}
            disabled={savingLink}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              linkEnabled ? 'bg-brand-500' : 'bg-brand-950/20'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                linkEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <PhotoUploadField
            value={form.photoUrl}
            onChange={(url) => setForm({ ...form, photoUrl: url })}
            uploadUrl="/inventory/upload-photo"
            label="Foto"
            className="shrink-0"
          />
          <div className="w-full flex-1 min-w-0 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Insumo (ej: Queso)"
                required
                className="w-full min-w-0 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              {addingCategory ? (
                <div className="flex gap-1.5">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nueva categoría"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  <button type="button" onClick={addCategory} className="text-xs font-medium text-brand-500 shrink-0">
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingCategory(false)}
                    className="text-xs text-brand-950/40 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <select
                  value={form.categoryId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') setAddingCategory(true);
                    else setForm({ ...form, categoryId: e.target.value });
                  }}
                  className="w-full min-w-0 border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ Nueva categoría…</option>
                </select>
              )}
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <select
            value={form.unit}
            onChange={(e) => {
              const unit = e.target.value;
              setForm({ ...form, unit, subUnit: (SUB_UNITS[unit] ?? [])[0]?.value ?? '' });
            }}
            required
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          >
            <option value="">Unidad…</option>
            <option value="kg">{UNIT_LABELS.kg}</option>
            <option value="lt">{UNIT_LABELS.lt}</option>
            <option value="ml">{UNIT_LABELS.ml}</option>
            <option value="unidad">{UNIT_LABELS.unidad}</option>
          </select>
          <div className="flex gap-1.5">
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Cantidad"
              type="number"
              step="0.01"
              min="0"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
            {subUnitOptions.length > 1 && (
              <select
                value={form.subUnit}
                onChange={(e) => setForm({ ...form, subUnit: e.target.value })}
                className="shrink-0 border border-brand-950/15 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              >
                {subUnitOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="block text-sm sm:col-span-2">
            <span className="text-brand-950/70">
              Stock mínimo (aviso de reabastecer)
              {subUnitOptions.length > 1 && ` — en ${subUnitOptions.find((u) => u.value === form.subUnit)?.label ?? ''}`}
            </span>
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
          <label className="block text-sm">
            <span className="text-brand-950/70">
              Precio por Unidad
              {form.quantity
                ? ` (de ${form.quantity} ${subUnitOptions.find((u) => u.value === form.subUnit)?.label ?? UNIT_LABELS[form.unit] ?? ''})`
                : ''}
            </span>
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="0.00"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
            {editingId && (
              <span className="block text-xs text-brand-950/40 font-light mt-1">
                Si el proveedor cambió el precio, el costo de las recetas que usan este insumo se actualiza automáticamente.
              </span>
            )}
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Moneda</span>
            <select
              value={form.priceCurrency}
              onChange={(e) => setForm({ ...form, priceCurrency: e.target.value as 'BASE' | 'BS' })}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              <option value="BASE">{symbol}</option>
              <option value="BS">Bs</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-brand-950/10 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-brand-950/70">
            <input
              type="checkbox"
              checked={form.isPackaging}
              onChange={(e) => setForm({ ...form, isPackaging: e.target.checked })}
              className="rounded border-brand-950/30"
            />
            Es un envase para delivery (envase, caja o bolsa)
          </label>
          {form.isPackaging && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-brand-950/70">Tipo</span>
                <select
                  value={form.packagingType}
                  onChange={(e) => setForm({ ...form, packagingType: e.target.value as 'ENVASE' | 'CAJA' | 'BOLSA' })}
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                >
                  <option value="ENVASE">Envase</option>
                  <option value="CAJA">Caja</option>
                  <option value="BOLSA">Bolsa</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Precio de venta al cliente ({symbol})</span>
                <input
                  value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="0.00"
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar insumo'}
          </TextureButton>
          {editingId && (
            <TextureButton variant="minimal" size="default" type="button" className="!w-auto" onClick={cancelEdit}>
              Cancelar
            </TextureButton>
          )}
        </div>
      </form>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-brand-950">Insumos</h2>
          {!!items?.length && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-brand-950/60">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === items.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < items.length;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
              />
              Seleccionar todo
            </label>
          )}
          {selected.size > 0 && (
            <TextureButton
              variant="minimal"
              size="sm"
              className="!w-auto flex items-center gap-1.5 whitespace-nowrap !text-red-600"
              disabled={bulkDeleting}
              onClick={bulkRemove}
            >
              <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Borrando…' : `Eliminar ${selected.size}`}
            </TextureButton>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {printSent && <span className="text-xs text-emerald-600 font-medium">Enviado a la estación de impresión</span>}
          <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloadingTemplate} onClick={downloadImportTemplate}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> {downloadingTemplate ? 'Generando…' : 'Descargar plantilla'}
          </TextureButton>
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> {importing ? 'Importando…' : 'Importar Excel'}
          </TextureButton>
          <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto"
            disabled={printingList || !items?.length}
            onClick={printInsumosList}
          >
            <Printer className="h-3.5 w-3.5" /> {printingList ? 'Enviando…' : 'Imprimir lista de insumos'}
          </TextureButton>
        </div>
      </div>

      {importResult && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4 text-sm space-y-1">
          <p className="text-brand-950">
            {importResult.created} creados · {importResult.updated} actualizados
            {importResult.errors.length > 0 && <span className="text-red-600"> · {importResult.errors.length} con error</span>}
          </p>
          {importResult.errors.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">
              {importResult.errors.map((e, i) => (
                <li key={i}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items?.length === 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
          <p className="text-sm text-brand-950/40 font-light">Sin insumos todavía.</p>
        </div>
      )}

      {groupByCategory(items ?? [], categories).map(([groupName, groupItems]) => (
        <div key={groupName} className="space-y-2">
          <h3 className="text-xs font-semibold text-brand-950/50 uppercase tracking-wide px-1">{groupName}</h3>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
            {groupItems.map((item) => {
              const qty = Number(item.quantity);
              const minQty = Number(item.minQuantity);
              const low = qty < minQty;
              // Barra: se llena hasta el doble del mínimo ("stock sano"); se acorta y cambia de
              // color mientras se acerca al punto de aviso, para que se note antes de llegar a cero.
              const ratio = minQty > 0 ? Math.min(1, qty / (minQty * 2)) : 1;
              const barColor = low ? 'bg-red-500' : ratio < 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    className="h-4 w-4 shrink-0 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
                  />
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-brand-950/[0.06] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-brand-950 flex items-center gap-1.5">
                      {item.name}
                      {low && (
                        <span title="Por debajo del stock mínimo">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                      {item.packagingType && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-brand-500 bg-brand-500/10 rounded-full px-2 py-0.5">
                          {PACKAGING_TYPE_LABELS[item.packagingType]}
                        </span>
                      )}
                    </p>
                    <p className={`text-xs font-light mt-0.5 ${low ? 'text-amber-600' : 'text-brand-950/40'}`}>
                      {item.quantity} {UNIT_LABELS[item.unit] ?? item.unit} · mínimo {item.minQuantity}{' '}
                      {UNIT_LABELS[item.unit] ?? item.unit}
                      {item.pricePerUnitBase && ` · costo ${symbol}${item.pricePerUnitBase}/${UNIT_LABELS[item.unit] ?? item.unit}`}
                      {item.salePriceBase && ` · venta ${symbol}${item.salePriceBase}`}
                    </p>
                    {minQty > 0 && (
                      <div className="h-1.5 w-full max-w-48 rounded-full bg-brand-950/[0.08] overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    )}
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
      ))}
    </div>
  );
}

/** Agrupa insumos por categoría (en el orden de las categorías), dejando "Sin categoría" al final. */
function groupByCategory(items: InventoryItem[], categories: InventoryCategory[]): [string, InventoryItem[]][] {
  const byCategoryId = new Map<string, InventoryItem[]>();
  const uncategorized: InventoryItem[] = [];
  for (const item of items) {
    if (item.categoryId) {
      const list = byCategoryId.get(item.categoryId) ?? [];
      list.push(item);
      byCategoryId.set(item.categoryId, list);
    } else {
      uncategorized.push(item);
    }
  }
  const groups: [string, InventoryItem[]][] = [];
  for (const c of categories) {
    const list = byCategoryId.get(c.id);
    if (list?.length) groups.push([c.name, list]);
  }
  if (uncategorized.length) groups.push(['Sin categoría', uncategorized]);
  return groups;
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
              className="!w-auto shrink-0"
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
  const [newItem, setNewItem] = useState({ inventoryItemId: '', quantity: '', subUnit: '' });
  const [error, setError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedInsumo = insumos.find((i) => i.id === newItem.inventoryItemId);
  const subUnitOptions = selectedInsumo ? SUB_UNITS[selectedInsumo.unit] ?? SUB_UNITS.unidad : [];

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
    if (!newItem.inventoryItemId || !newItem.quantity || !newItem.subUnit) {
      setError('Completa insumo y cantidad.');
      return;
    }
    const subUnit = subUnitOptions.find((u) => u.value === newItem.subUnit);
    const quantityInBaseUnit = Number(newItem.quantity) * (subUnit?.toBase ?? 1);
    try {
      await api.post(`/inventory/recipes/${productId}`, {
        inventoryItemId: newItem.inventoryItemId,
        quantity: quantityInBaseUnit,
      });
      setNewItem({ inventoryItemId: '', quantity: '', subUnit: '' });
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

  async function downloadImportTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await api.get(`/inventory/recipes/${productId}/import-template`, { responseType: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = `receta-${productName || productId}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('No se pudo generar la plantilla. Intenta de nuevo.');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/inventory/recipes/${productId}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data.data);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receta: {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloadingTemplate} onClick={downloadImportTemplate}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> {downloadingTemplate ? 'Generando…' : 'Descargar plantilla'}
            </TextureButton>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> {importing ? 'Importando…' : 'Importar Excel'}
            </TextureButton>
            <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
          </div>

          {importResult && (
            <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.03] p-3 text-xs space-y-1">
              <p className="text-brand-950">
                {importResult.created} creados · {importResult.updated} actualizados
                {importResult.errors.length > 0 && <span className="text-red-600"> · {importResult.errors.length} con error</span>}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="text-red-600 space-y-0.5">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

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
                onChange={(e) => {
                  const item = insumos.find((i) => i.id === e.target.value);
                  const defaultSubUnit = item ? (SUB_UNITS[item.unit] ?? SUB_UNITS.unidad)[0].value : '';
                  setNewItem({ inventoryItemId: e.target.value, quantity: '', subUnit: defaultSubUnit });
                }}
                className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="">Insumo…</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({UNIT_LABELS[i.unit] ?? i.unit})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="Cantidad usada"
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                />
                <select
                  value={newItem.subUnit}
                  onChange={(e) => setNewItem({ ...newItem, subUnit: e.target.value })}
                  disabled={!selectedInsumo}
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50"
                >
                  {subUnitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-brand-950/40">El costo se calcula automáticamente según el precio del insumo.</p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <TextureButton variant="brand" size="sm" className="!w-auto" onClick={addIngredient}>
                  Guardar ingrediente
                </TextureButton>
                <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setAdding(false)}>
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

// -----------------------------------------------------------------------------
//  Transferencia de insumos: mueve cantidad de un insumo de una sede a otra dentro
//  del mismo grupo (sede principal + sucursales), o hacia/desde Casa Matriz.
// -----------------------------------------------------------------------------

interface TransferLocation {
  restaurantId: string;
  scope: 'LOCAL' | 'CASA_MATRIZ';
  name: string;
  isMain: boolean;
}

interface TransferItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
}

interface TransferRecord {
  id: string;
  fromLocationName: string;
  toLocationName: string;
  itemName: string;
  unit: string;
  quantity: string;
  createdAt: string;
}

function locationKey(restaurantId: string, scope: string) {
  return `${restaurantId}:${scope}`;
}

function TransferenciasTab() {
  const [locations, setLocations] = useState<TransferLocation[] | null>(null);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [fromItems, setFromItems] = useState<TransferItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadHistory() {
    api.get('/inventory/transfers').then((res) => setHistory(res.data.data));
  }

  useEffect(() => {
    api.get('/inventory/transfer-locations').then((res) => setLocations(res.data.data));
    loadHistory();
  }, []);

  useEffect(() => {
    if (!fromKey) {
      setFromItems([]);
      setItemId('');
      return;
    }
    const [restaurantId, scope] = fromKey.split(':');
    api
      .get('/inventory/transfer-locations/items', { params: { restaurantId, scope } })
      .then((res) => setFromItems(res.data.data));
    setItemId('');
  }, [fromKey]);

  const selectedItem = fromItems.find((i) => i.id === itemId);
  const toOptions = (locations ?? []).filter((l) => locationKey(l.restaurantId, l.scope) !== fromKey);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromKey || !toKey || !itemId) return;
    const [fromRestaurantId, fromScope] = fromKey.split(':');
    const [toRestaurantId, toScope] = toKey.split(':');
    setSaving(true);
    try {
      await api.post('/inventory/transfers', {
        fromRestaurantId,
        fromScope,
        toRestaurantId,
        toScope,
        itemId,
        quantity: Number(quantity) || 0,
      });
      setItemId('');
      setQuantity('');
      // Recarga los insumos del origen (la cantidad disponible cambió) y el historial.
      const res = await api.get('/inventory/transfer-locations/items', { params: { restaurantId: fromRestaurantId, scope: fromScope } });
      setFromItems(res.data.data);
      loadHistory();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar la transferencia.');
    } finally {
      setSaving(false);
    }
  }

  if (!locations) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  if (locations.length < 2) {
    return (
      <p className="text-sm text-brand-950/50 font-light">
        Todavía no tienes otras sedes ni Casa Matriz activada para transferir insumos. Crea una sucursal en
        Administración → Sucursales, o activa Casa Matriz, para usar esta pestaña.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-brand-950/70">Origen</span>
            <select
              value={fromKey}
              onChange={(e) => {
                setFromKey(e.target.value);
                if (e.target.value === toKey) setToKey('');
              }}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            >
              <option value="">Elige el origen…</option>
              {locations.map((l) => (
                <option key={locationKey(l.restaurantId, l.scope)} value={locationKey(l.restaurantId, l.scope)}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Destino</span>
            <select
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
              required
              disabled={!fromKey}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
            >
              <option value="">Elige el destino…</option>
              {toOptions.map((l) => (
                <option key={locationKey(l.restaurantId, l.scope)} value={locationKey(l.restaurantId, l.scope)}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-brand-950/70">Insumo</span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              required
              disabled={!fromKey || fromItems.length === 0}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
            >
              <option value="">{fromKey && fromItems.length === 0 ? 'Sin insumos en esa sede' : 'Elige el insumo…'}</option>
              {fromItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.quantity} {i.unit} disponibles)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Cantidad{selectedItem ? ` (${selectedItem.unit})` : ''}</span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              disabled={!itemId}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={saving || !fromKey || !toKey || !itemId} className="!w-auto disabled:opacity-50">
          {saving ? 'Transfiriendo…' : 'Transferir'}
        </TextureButton>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-brand-950 mb-2">Historial</h2>
        {history.length === 0 ? (
          <p className="text-sm text-brand-950/50 font-light">Todavía no se ha hecho ninguna transferencia.</p>
        ) : (
          <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">
            {history.map((h) => (
              <li key={h.id} className="px-4 py-3 text-sm">
                <p className="text-brand-950">
                  <span className="font-medium">
                    {h.quantity} {h.unit} de {h.itemName}
                  </span>{' '}
                  — {h.fromLocationName} → {h.toLocationName}
                </p>
                <p className="text-xs text-brand-950/40 font-light mt-0.5">{new Date(h.createdAt).toLocaleString('es-VE')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
