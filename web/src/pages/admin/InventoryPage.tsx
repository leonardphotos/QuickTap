import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AlertTriangle, FileSpreadsheet, Plus, Printer, Search, Trash2, Upload, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import type { Product } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PhotoUploadField } from '@/components/admin/PhotoUploadField';
import { AddStockDialog } from '@/components/admin/AddStockDialog';
import { InventoryAlertsTab } from '@/components/admin/InventoryAlertsTab';
import { WasteSection } from '@/components/admin/waste/WasteSection';
import { EXPIRY_CLASS, expiryLabel, expiryStatus } from '@/utils/expiry';
import { UNIT_LABELS, SUB_UNITS } from '@/utils/inventoryUnits';

interface InventoryCategory {
  id: string;
  name: string;
  priority: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  minQuantity: string;
  pricePerUnitBase: string | null;
  // % aprovechable tras merma/limpieza y % de colchón por fluctuación de precio —
  // ajustan el costo real que usan recetas y preparaciones.
  yieldPercent: string;
  correctionPercent: string;
  photoUrl?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  // Envase: no nulo = este insumo se puede vincular como envase de un producto.
  packagingType?: 'ENVASE' | 'CAJA' | 'BOLSA' | null;
  salePriceBase?: string | null;
  /** "YYYY-MM-DD" o null. Ver web/src/utils/expiry.ts. */
  expiryDate?: string | null;
  // Disponible en el picker curado de "Toppings" al crear un modificador (ver
  // ModifierCategoriesDialog.tsx) — sigue siendo un insumo normal en todo lo demás.
  isTopping?: boolean;
}

const PACKAGING_TYPE_LABELS: Record<string, string> = { ENVASE: 'Envase', CAJA: 'Caja', BOLSA: 'Bolsa' };

/** Minúsculas y sin acentos, para que el buscador no dependa de cómo se tipeó. */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Costo real por unidad tras aplicar rendimiento/factor de corrección — mismo cálculo
 * que src/modules/inventory/costing.ts#resolveCostPerBaseUnit, aquí solo para mostrar. */
function adjustedCost(item: InventoryItem): string {
  const price = Number(item.pricePerUnitBase ?? 0);
  const yieldFraction = Number(item.yieldPercent || 100) / 100;
  const correction = Number(item.correctionPercent || 0) / 100;
  if (yieldFraction <= 0) return '0.00';
  return ((price * (1 + correction)) / yieldFraction).toFixed(2);
}

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
  expiryDate: '',
  yieldPercent: '100',
  correctionPercent: '0',
  isTopping: false,
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
    ...(canRecipes ? [{ id: 'preparaciones', label: 'Preparaciones' }] : []),
    ...(canRecipes ? [{ id: 'toppings', label: 'Toppings' }] : []),
    { id: 'stock', label: 'Stock de productos' },
    { id: 'merma', label: 'Merma' },
    { id: 'alertas', label: 'Alertas' },
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
          canRecipes={canRecipes}
        />
      )}
      {tab === 'preparaciones' && canRecipes && <PreparacionesTab insumos={items ?? []} />}
      {tab === 'toppings' && canRecipes && (
        <div className="space-y-10">
          <div>
            <h2 className="text-sm font-semibold text-brand-950/70 mb-3">Topping = un solo insumo</h2>
            <InsumosTab
              locationScope="LOCAL"
              items={(items ?? []).filter((i) => i.isTopping)}
              categories={categories}
              onChanged={loadItems}
              onCategoriesChanged={loadCategories}
              showModifierLinkToggle={false}
              canRecipes={canRecipes}
              toppingsOnly
            />
          </div>
          <div className="border-t border-brand-950/10 pt-8">
            <h2 className="text-sm font-semibold text-brand-950/70 mb-1">Topping = varios insumos (preparación)</h2>
            <p className="text-sm text-brand-950/60 font-light mb-3">
              Ej. "Pico de gallo" = tomate + cebolla + cilantro, en las cantidades que definas. Se arma igual que una
              Preparación normal (pestaña "Preparaciones"), solo que además aparece en el picker de Toppings al crear
              un modificador.
            </p>
            <PreparacionesTab insumos={items ?? []} toppingsOnly />
          </div>
        </div>
      )}
      {tab === 'stock' && <StockTab />}
      {tab === 'merma' && <WasteSection />}
      {tab === 'alertas' && <InventoryAlertsTab />}
      {tab === 'casa-matriz' && (
        <InsumosTab
          locationScope="CASA_MATRIZ"
          items={casaMatrizItems}
          categories={categories}
          onChanged={loadCasaMatrizItems}
          onCategoriesChanged={loadCategories}
          showModifierLinkToggle={false}
          canRecipes={canRecipes}
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


/** Tres estados, iguales a los de Inventario → Alertas: sin existencias, por
 * agotarse (por debajo del mínimo cargado) o con stock sano. */
function stockLabel(p: Product): string {
  const qty = p.stockQuantity ?? 0;
  const min = p.stockMinQuantity ?? 0;
  if (qty <= 0) return 'Agotado';
  if (min > 0 && qty <= min) return 'Por agotarse';
  return 'En stock';
}

function stockClass(p: Product): string {
  const qty = p.stockQuantity ?? 0;
  const min = p.stockMinQuantity ?? 0;
  if (qty <= 0) return 'bg-red-100 text-red-700';
  if (min > 0 && qty <= min) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-brand-950/60 font-light">
          Activa el control de stock por producto: al llegar a 0 se marca como agotado en el menú público.
        </p>
        <AddStockDialog
          items={products.map((p) => ({
            id: p.id,
            name: p.name,
            currentQuantity: p.stockControlEnabled ? (p.stockQuantity ?? 0) : 0,
            unitLabel: 'unid.',
          }))}
          onAdd={async (id, delta) => {
            const p = products.find((x) => x.id === id);
            if (!p) return;
            const current = p.stockControlEnabled ? (p.stockQuantity ?? 0) : 0;
            await patchProduct(id, { stockControlEnabled: true, stockQuantity: current + delta });
          }}
        />
      </div>
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
                <div className="flex items-center gap-2 shrink-0">
                  {/* La caducidad no depende del control de stock: un producto puede
                      caducar aunque no se lleve la cuenta de cuántos quedan. */}
                  <label className="flex flex-col items-end text-[10px] text-brand-950/45">
                    Caduca
                    <input
                      type="date"
                      defaultValue={p.expiryDate ?? ''}
                      disabled={savingId === p.id}
                      onChange={(e) => patchProduct(p.id, { expiryDate: e.target.value })}
                      className="mt-0.5 border border-brand-950/15 rounded-lg px-2 py-1 text-xs text-brand-950"
                    />
                  </label>

                  {p.stockControlEnabled && (
                    <>
                      <label className="flex flex-col items-end text-[10px] text-brand-950/45">
                        Quedan
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={p.stockQuantity ?? 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => patchProduct(p.id, { stockControlEnabled: true, stockQuantity: Number(e.target.value) || 0 })}
                          className="mt-0.5 w-20 border border-brand-950/15 rounded-lg px-2 py-1 text-sm text-right"
                        />
                      </label>
                      <label className="flex flex-col items-end text-[10px] text-brand-950/45">
                        Mínimo
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={p.stockMinQuantity ?? 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => patchProduct(p.id, { stockMinQuantity: Number(e.target.value) || 0 })}
                          className="mt-0.5 w-16 border border-brand-950/15 rounded-lg px-2 py-1 text-sm text-right"
                        />
                      </label>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stockClass(p)}`}>
                        {stockLabel(p)}
                      </span>
                    </>
                  )}
                </div>
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
  canRecipes = false,
  toppingsOnly = false,
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
  /** Rendimiento/factor de corrección solo tienen efecto con Recetas (Premium) — se
   * ocultan del formulario si el plan no las incluye. */
  canRecipes?: boolean;
  /** Pestaña "Toppings": misma tabla de insumos, filtrada a los marcados como topping, con el
   * formulario listo para crear el siguiente ya marcado (ver InventoryPage#toppings). */
  toppingsOnly?: boolean;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const initialForm = toppingsOnly ? { ...emptyForm, isTopping: true } : emptyForm;
  const [form, setForm] = useState(initialForm);
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
  const [search, setSearch] = useState('');
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
      expiryDate: item.expiryDate ?? '',
      yieldPercent: item.yieldPercent ?? '100',
      correctionPercent: item.correctionPercent ?? '0',
      isTopping: !!item.isTopping,
    });
  }

  const subUnitOptions = SUB_UNITS[form.unit] ?? [];

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
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
        // Cadena vacía = el backend la interpreta como "borrar la fecha".
        expiryDate: form.expiryDate,
        locationScope,
        isTopping: form.isTopping,
        ...(canRecipes
          ? { yieldPercent: Number(form.yieldPercent) || 100, correctionPercent: Number(form.correctionPercent) || 0 }
          : {}),
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
    const allIds = filteredItems.map((i) => i.id);
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }

  // El buscador filtra por nombre y categoría, ignorando acentos — mismo criterio que
  // Productos. Se aplica antes de agrupar por categoría, así que una búsqueda puede dejar
  // secciones vacías fuera de la vista en vez de mostrarlas con "0 insumos".
  const filteredItems = (items ?? []).filter((i) => {
    const q = normalize(search);
    if (!q) return true;
    return normalize(i.name).includes(q) || normalize(i.category?.name).includes(q);
  });

  // Mover los insumos seleccionados a una categoría de un solo golpe ('' = "Sin categoría").
  const [bulkMoving, setBulkMoving] = useState(false);
  async function bulkMove(categoryId: string) {
    if (selected.size === 0) return;
    setBulkMoving(true);
    try {
      await api.post('/inventory/categories/assign', { itemIds: Array.from(selected), categoryId: categoryId || null });
      setSelected(new Set());
      onChanged();
    } finally {
      setBulkMoving(false);
    }
  }
  // Gestor de categorías (crear fuera del insumo, renombrar, eliminar).
  const [showCategoryManager, setShowCategoryManager] = useState(false);

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
      {toppingsOnly && (
        <p className="text-sm text-brand-950/60 font-light -mt-2">
          Insumos marcados como Topping: aparecen en un picker aparte al crear un modificador (Productos → Modificadores),
          para vincularlo a inventario sin buscarlo entre todos los insumos.
        </p>
      )}
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
          <label className="block text-sm sm:col-span-2">
            <span className="text-brand-950/70">Fecha de caducidad (opcional)</span>
            <input
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              type="date"
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
            <span className="mt-1 block text-[11px] font-light text-brand-950/40">
              Si la pones, el sistema te avisa en el Dashboard cuando el lote está por vencer.
            </span>
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

        {canRecipes && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-brand-950/70">Rendimiento % (tras merma o limpieza)</span>
              <input
                value={form.yieldPercent}
                onChange={(e) => setForm({ ...form, yieldPercent: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="100"
                type="number"
                step="1"
                min="1"
                max="100"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <span className="block text-xs text-brand-950/40 font-light mt-1">
                Ej: 90 = de 1 {UNIT_LABELS[form.unit] ?? form.unit} comprado solo 90% sirve. Ajusta el costo real de recetas y preparaciones.
              </span>
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Factor de corrección % (colchón de precio)</span>
              <input
                value={form.correctionPercent}
                onChange={(e) => setForm({ ...form, correctionPercent: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="0"
                type="number"
                step="1"
                min="0"
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>
          </div>
        )}

        <div className="rounded-xl border border-brand-950/10 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-brand-950/70">
            <input
              type="checkbox"
              checked={form.isTopping}
              onChange={(e) => setForm({ ...form, isTopping: e.target.checked })}
              className="rounded border-brand-950/30"
            />
            Es un Topping (aparece en ese picker al crear un modificador)
          </label>
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
          {filteredItems.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-brand-950/60">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === filteredItems.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < filteredItems.length;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-brand-950/30 text-brand-500 focus:ring-brand-400"
              />
              Seleccionar todo
            </label>
          )}
          {selected.size > 0 && (
            <>
              <select
                value=""
                disabled={bulkMoving}
                onChange={(e) => {
                  if (e.target.value === '__none__') bulkMove('');
                  else if (e.target.value) bulkMove(e.target.value);
                }}
                className="rounded-full border border-brand-950/15 bg-white px-2.5 py-1 text-xs font-medium text-brand-950/70 disabled:opacity-50"
              >
                <option value="">{bulkMoving ? 'Moviendo…' : `Mover ${selected.size} a categoría…`}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__none__">Sin categoría</option>
              </select>
              <TextureButton
                variant="minimal"
                size="sm"
                className="!w-auto flex items-center gap-1.5 whitespace-nowrap !text-red-600"
                disabled={bulkDeleting}
                onClick={bulkRemove}
              >
                <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Borrando…' : `Eliminar ${selected.size}`}
              </TextureButton>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowCategoryManager((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              showCategoryManager ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            Categorías {categories.length > 0 && <span className="opacity-70">{categories.length}</span>}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {printSent && <span className="text-xs text-emerald-600 font-medium">Enviado a la estación de impresión</span>}
          <AddStockDialog
            items={(items ?? []).map((i) => ({
              id: i.id,
              name: i.name,
              currentQuantity: Number(i.quantity),
              unitLabel: UNIT_LABELS[i.unit] ?? i.unit,
            }))}
            onAdd={async (id, delta) => {
              const item = items?.find((i) => i.id === id);
              if (!item) return;
              await api.patch(`/inventory/${id}`, { quantity: Number(item.quantity) + delta, locationScope });
              onChanged();
            }}
          />
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo por nombre o categoría…"
          aria-label="Buscar insumos"
          className="w-full rounded-xl border border-brand-950/15 bg-white py-2 pl-10 pr-10 text-sm text-brand-950 placeholder:text-brand-950/35 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-950/40 hover:bg-brand-950/5 hover:text-brand-950/70"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          items={items ?? []}
          onChanged={() => {
            onCategoriesChanged();
            onChanged();
          }}
        />
      )}

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
          <p className="text-sm text-brand-950/40 font-light">
            {toppingsOnly ? 'Sin toppings todavía — marca "Es un Topping" al crear el primero.' : 'Sin insumos todavía.'}
          </p>
        </div>
      )}

      {!!items?.length && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
          <p className="text-sm text-brand-950/40 font-light">Ningún insumo coincide con "{search}".</p>
        </div>
      )}

      {groupByCategory(filteredItems, categories).map(([groupName, groupItems]) => (
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
                      {!toppingsOnly && item.isTopping && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                          Topping
                        </span>
                      )}
                      {/* Solo se muestra cuando ya importa: un lote que vence dentro de meses no aporta ruido. */}
                      {item.expiryDate && expiryStatus(item.expiryDate) !== 'OK' && (
                        <span
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${EXPIRY_CLASS[expiryStatus(item.expiryDate)]}`}
                        >
                          {expiryLabel(item.expiryDate)}
                        </span>
                      )}
                    </p>
                    <p className={`text-xs font-light mt-0.5 ${low ? 'text-amber-600' : 'text-brand-950/40'}`}>
                      {item.quantity} {UNIT_LABELS[item.unit] ?? item.unit} · mínimo {item.minQuantity}{' '}
                      {UNIT_LABELS[item.unit] ?? item.unit}
                      {item.pricePerUnitBase && ` · costo ${symbol}${item.pricePerUnitBase}/${UNIT_LABELS[item.unit] ?? item.unit}`}
                      {canRecipes &&
                        item.pricePerUnitBase &&
                        (Number(item.yieldPercent) !== 100 || Number(item.correctionPercent) !== 0) &&
                        ` · ajustado ${symbol}${adjustedCost(item)}/${UNIT_LABELS[item.unit] ?? item.unit} (rend. ${item.yieldPercent}%, corr. ${item.correctionPercent}%)`}
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

/**
 * Gestor de categorías de insumos, fuera del formulario del insumo: crear, renombrar y
 * eliminar. Al eliminar, sus insumos quedan "Sin categoría" (no se borran — el FK es SetNull).
 */
function CategoryManager({
  categories,
  items,
  onChanged,
}: {
  categories: InventoryCategory[];
  items: InventoryItem[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countFor = (id: string) => items.filter((i) => i.categoryId === id).length;

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/inventory/categories', { name: name.trim() });
      setName('');
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/inventory/categories/${id}`, { name: editName.trim() });
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo renombrar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((c) => (c === id ? null : c)), 3000);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/inventory/categories/${id}`);
      setConfirmDeleteId(null);
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'rounded-lg border border-brand-950/15 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-brand-950">Categorías de insumos</p>
        <p className="text-xs text-brand-950/45 font-light">
          Crea categorías acá y luego marca varios insumos y usa "Mover a categoría…". Al eliminar una, sus insumos quedan sin
          categoría (no se borran).
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
          placeholder="Nueva categoría (ej. Carnes, Lácteos, Empaques)"
          className={`${inputCls} flex-1`}
        />
        <TextureButton variant="brand" size="sm" className="!w-auto" disabled={saving || !name.trim()} onClick={create}>
          Crear
        </TextureButton>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="divide-y divide-brand-950/[0.06]">
        {categories.length === 0 && <p className="py-2 text-xs text-brand-950/40 font-light">Todavía no hay categorías.</p>}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 py-2">
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className={`${inputCls} flex-1`}
                />
                <TextureButton variant="brand" size="sm" className="!w-auto" disabled={saving} onClick={() => rename(c.id)}>
                  Guardar
                </TextureButton>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-brand-950/50 hover:text-brand-950">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-950">{c.name}</span>
                <span className="shrink-0 text-xs text-brand-950/40">
                  {countFor(c.id)} insumo{countFor(c.id) === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-brand-950/60 hover:bg-brand-950/[0.05]"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={saving}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                    confirmDeleteId === c.id ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="h-3 w-3" /> {confirmDeleteId === c.id ? '¿Seguro?' : 'Eliminar'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
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
    byCategoryId.delete(c.id);
  }
  // Insumo con una categoría que esta sede no tiene (llegó por transferencia desde otra sede):
  // antes no entraba en ningún grupo y desaparecía de la lista aunque existiera de verdad.
  for (const list of byCategoryId.values()) uncategorized.push(...list);
  if (uncategorized.length) groups.push(['Sin categoría', uncategorized]);
  return groups;
}

// -----------------------------------------------------------------------------
//  Recetas: vincula productos del menú con insumos.
// -----------------------------------------------------------------------------

interface PreparationOverviewRow {
  id: string;
  name: string;
  unit: string;
  unitLabel: string;
  yieldQuantity: string;
  isTopping: boolean;
  ingredientCount: number;
  totalCostBase: string;
  costPerBaseUnit: string;
}

interface PreparationLine {
  id: string;
  type: 'insumo' | 'preparacion';
  inventoryItemId: string | null;
  componentPreparationId: string | null;
  name: string;
  unit: string;
  quantity: string;
  costBase: string;
}

/** Preparaciones (sub-recetas): bases intermedias reutilizables entre platos (fondo, salsa
 * madre, masa), armadas a partir de insumos y/o de otras preparaciones. No tienen stock
 * propio — su costo se calcula en vivo y queda disponible como ingrediente en Recetas. */
function PreparacionesTab({ insumos, toppingsOnly = false }: { insumos: InventoryItem[]; toppingsOnly?: boolean }) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [allRows, setAllRows] = useState<PreparationOverviewRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPrep, setNewPrep] = useState({ name: '', unit: 'kg' as 'kg' | 'lt', yieldQuantity: '' });
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/inventory/preparations').then((res) => setAllRows(res.data.data));
  }

  useEffect(load, []);

  // En la pestaña Toppings esto solo lista/crea las preparaciones curadas isTopping — el resto
  // de Preparaciones (fondos, salsas madre que no son un topping) no aparece acá.
  const rows = toppingsOnly ? allRows?.filter((r) => r.isTopping) : allRows;

  async function createPreparation() {
    setError(null);
    if (!newPrep.name.trim() || !newPrep.yieldQuantity) {
      setError('Completa el nombre y cuánto rinde.');
      return;
    }
    try {
      // Igual criterio que las cantidades de ingredientes: se escribe en gr/ml (natural para
      // una preparación) y se convierte a la unidad declarada (kg/lt) antes de guardar.
      const toBase = (SUB_UNITS[newPrep.unit] ?? [])[1]?.toBase ?? 0.001;
      const res = await api.post('/inventory/preparations', {
        name: newPrep.name.trim(),
        unit: newPrep.unit,
        yieldQuantity: Number(newPrep.yieldQuantity) * toBase,
        isTopping: toppingsOnly ? true : undefined,
      });
      setNewPrep({ name: '', unit: 'kg', yieldQuantity: '' });
      setCreating(false);
      load();
      setOpenId(res.data.data.id);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la preparación.');
    }
  }

  return (
    <div className="space-y-5">
      {insumos.length === 0 && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3">
          Primero agrega insumos en la pestaña "Insumos (normal)": las preparaciones se arman a partir de ellos.
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && !creating && (
          <p className="p-5 text-sm text-brand-950/40 font-light">
            {toppingsOnly ? 'Sin toppings de varios insumos todavía.' : 'Sin preparaciones todavía.'}
          </p>
        )}
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-medium text-brand-950 truncate">
                {r.name}
                {!toppingsOnly && r.isTopping && (
                  <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 align-middle">
                    Topping
                  </span>
                )}
              </p>
              <p className="text-xs text-brand-950/40 font-light">
                {r.ingredientCount} ingrediente(s) · Rinde {(Number(r.yieldQuantity) * 1000).toFixed(0)} {r.unit === 'kg' ? 'gr' : 'ml'} ·
                Costo:{' '}
                {symbol}
                {r.totalCostBase} · {symbol}
                {r.costPerBaseUnit}/{r.unitLabel}
              </p>
            </div>
            <TextureButton variant="minimal" size="sm" className="!w-auto shrink-0" onClick={() => setOpenId(r.id)}>
              Editar
            </TextureButton>
          </div>
        ))}

        {creating ? (
          <div className="p-5 space-y-2">
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={newPrep.name}
                onChange={(e) => setNewPrep({ ...newPrep, name: e.target.value })}
                placeholder={toppingsOnly ? 'Nombre (ej: Pico de gallo)' : 'Nombre (ej: Pasta de ajo)'}
                autoFocus
                className="sm:col-span-2 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <select
                value={newPrep.unit}
                onChange={(e) => setNewPrep({ ...newPrep, unit: e.target.value as 'kg' | 'lt' })}
                className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="kg">Kg</option>
                <option value="lt">Lt</option>
              </select>
            </div>
            <input
              value={newPrep.yieldQuantity}
              onChange={(e) => setNewPrep({ ...newPrep, yieldQuantity: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder={`Cuánto rinde, en ${newPrep.unit === 'kg' ? 'gramos' : 'mililitros'}`}
              className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <TextureButton variant="brand" size="sm" className="!w-auto" onClick={createPreparation}>
                Crear
              </TextureButton>
              <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setCreating(false)}>
                Cancelar
              </TextureButton>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline p-5"
          >
            <Plus className="h-4 w-4" /> {toppingsOnly ? 'Nuevo topping (varios insumos)' : 'Nueva preparación'}
          </button>
        )}
      </div>

      {openId && (
        <PreparationDialog
          id={openId}
          insumos={insumos}
          preparations={allRows ?? []}
          hideToppingToggle={toppingsOnly}
          onClose={() => setOpenId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PreparationDialog({
  id,
  insumos,
  preparations,
  hideToppingToggle = false,
  onClose,
  onSaved,
}: {
  id: string;
  insumos: InventoryItem[];
  preparations: PreparationOverviewRow[];
  /** Se abre desde la pestaña Toppings: ya se sabe que es un topping, no hace falta el interruptor. */
  hideToppingToggle?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lt'>('kg');
  const [isTopping, setIsTopping] = useState(false);
  const [savingTopping, setSavingTopping] = useState(false);
  const [lines, setLines] = useState<PreparationLine[] | null>(null);
  const [totalCostBase, setTotalCostBase] = useState('0.00');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ ref: '', quantity: '', subUnit: '' });
  const [error, setError] = useState<string | null>(null);
  const [savingYield, setSavingYield] = useState(false);

  // No puede referenciarse a sí misma como ingrediente (evita el ciclo más obvio; el resto
  // los bloquea el backend).
  const otherPreparations = preparations.filter((p) => p.id !== id);

  const [refType, refId] = newItem.ref.split(':');
  const selectedInsumo = refType === 'insumo' ? insumos.find((i) => i.id === refId) : undefined;
  const selectedPrep = refType === 'prep' ? otherPreparations.find((p) => p.id === refId) : undefined;
  const selectedUnit = selectedInsumo?.unit ?? selectedPrep?.unit ?? '';
  const subUnitOptions = selectedUnit ? SUB_UNITS[selectedUnit] ?? [] : [];

  function load() {
    api.get(`/inventory/preparations/${id}`).then((res) => {
      setName(res.data.data.name);
      setUnit(res.data.data.unit);
      // El backend guarda en la unidad declarada (kg/lt) — se muestra en gr/ml, más natural
      // para escribir cuánto rinde una preparación.
      setYieldQuantity((Number(res.data.data.yieldQuantity) * 1000).toString());
      setIsTopping(!!res.data.data.isTopping);
      setLines(res.data.data.ingredients);
      setTotalCostBase(res.data.data.totalCostBase);
    });
  }

  useEffect(load, [id]);

  async function saveYield() {
    setSavingYield(true);
    setError(null);
    try {
      const toBase = (SUB_UNITS[unit] ?? [])[1]?.toBase ?? 0.001;
      await api.patch(`/inventory/preparations/${id}`, { yieldQuantity: (Number(yieldQuantity) || 1) * toBase });
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el rendimiento.');
    } finally {
      setSavingYield(false);
    }
  }

  async function addIngredient() {
    setError(null);
    if (!newItem.ref || !newItem.quantity || !newItem.subUnit) {
      setError('Completa ingrediente y cantidad.');
      return;
    }
    const subUnit = subUnitOptions.find((u) => u.value === newItem.subUnit);
    const quantityInBaseUnit = Number(newItem.quantity) * (subUnit?.toBase ?? 1);
    try {
      await api.post(`/inventory/preparations/${id}/ingredients`, {
        inventoryItemId: refType === 'insumo' ? refId : undefined,
        componentPreparationId: refType === 'prep' ? refId : undefined,
        quantity: quantityInBaseUnit,
      });
      setNewItem({ ref: '', quantity: '', subUnit: '' });
      setAdding(false);
      load();
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar el ingrediente.');
    }
  }

  async function removeIngredient(lineId: string) {
    await api.delete(`/inventory/preparations/ingredient/${lineId}`);
    load();
    onSaved();
  }

  async function toggleTopping(next: boolean) {
    setIsTopping(next);
    setSavingTopping(true);
    try {
      await api.patch(`/inventory/preparations/${id}`, { isTopping: next });
      onSaved();
    } catch {
      setIsTopping(!next);
    } finally {
      setSavingTopping(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preparación: {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lines?.length === 0 && !adding && (
            <p className="text-sm text-brand-950/40 font-light">Esta preparación todavía no tiene ingredientes.</p>
          )}

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {lines?.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 border-b border-brand-950/10 pb-2">
                <div className="text-sm">
                  <p className="font-medium text-brand-950 flex items-center gap-1.5">
                    {l.type === 'preparacion' && <span title="Preparación">🍯</span>}
                    {l.name}
                  </p>
                  <p className="text-xs text-brand-950/50 font-light">
                    {l.quantity} {UNIT_LABELS[l.unit] ?? l.unit} · $
                    {l.costBase}
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
                value={newItem.ref}
                onChange={(e) => {
                  const [t, rid] = e.target.value.split(':');
                  const item = t === 'insumo' ? insumos.find((i) => i.id === rid) : otherPreparations.find((p) => p.id === rid);
                  const u = t === 'insumo' ? (item as InventoryItem | undefined)?.unit : (item as PreparationOverviewRow | undefined)?.unit;
                  const defaultSubUnit = u ? (SUB_UNITS[u] ?? [])[0]?.value ?? '' : '';
                  setNewItem({ ref: e.target.value, quantity: '', subUnit: defaultSubUnit });
                }}
                className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="">Ingrediente…</option>
                <optgroup label="Insumos">
                  {insumos.map((i) => (
                    <option key={i.id} value={`insumo:${i.id}`}>
                      {i.name} ({UNIT_LABELS[i.unit] ?? i.unit})
                    </option>
                  ))}
                </optgroup>
                {otherPreparations.length > 0 && (
                  <optgroup label="Preparaciones">
                    {otherPreparations.map((p) => (
                      <option key={p.id} value={`prep:${p.id}`}>
                        🍯 {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
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
                  disabled={!selectedUnit}
                  className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50"
                >
                  {subUnitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-brand-950/40">El costo se calcula automáticamente según el precio/rendimiento del ingrediente.</p>
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

          <div className="pt-3 border-t border-brand-950/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-950/60">Costo total de ingredientes</span>
              <span className="text-lg font-semibold text-brand-950">${totalCostBase}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-brand-950/70 shrink-0">
                Esta preparación rinde ({unit === 'kg' ? 'gr' : 'ml'})
              </label>
              <input
                value={yieldQuantity}
                onChange={(e) => setYieldQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-24 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={savingYield} onClick={saveYield}>
                Guardar
              </TextureButton>
            </div>
            <p className="text-xs text-brand-950/40 font-light">
              Si entraron más gramos de insumos de los que rinde (merma al cocinar), el costo se reparte entre lo que realmente
              queda.
            </p>
            {!hideToppingToggle && (
              <label className="flex items-center gap-2 text-sm text-brand-950/70 pt-1">
                <input
                  type="checkbox"
                  checked={isTopping}
                  disabled={savingTopping}
                  onChange={(e) => toggleTopping(e.target.checked)}
                />
                Es un Topping (aparece en el picker de Inventario → Toppings al crear un modificador)
              </label>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recetario completo. Vive acá (pestaña Recetas de Inventario) pero se exporta porque también
 * se abre desde Productos: la receta es del PLATO, así que tenerla solo dentro de Inventario
 * obligaba a salir del catálogo para armarla. Se carga sus propios datos, así que el que la
 * abre solo tiene que pasarle la lista de insumos.
 */
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
