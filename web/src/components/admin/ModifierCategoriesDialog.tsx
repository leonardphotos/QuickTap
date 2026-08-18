import { useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBaseQuantity, subUnitsFor, UNIT_LABELS } from '@/utils/inventoryUnits';

/** Insumo tal como lo necesita el selector de vínculo de un modificador. */
interface InsumoOption {
  id: string;
  name: string;
  unit: string;
  isTopping?: boolean;
}

/** Preparación (sub-receta) tal como la necesita el selector de vínculo de un modificador. */
interface PreparationOption {
  id: string;
  name: string;
  unit: string;
}

/** Selector combinado insumo/preparación del vínculo de inventario de un modificador:
 * un solo <select> con value compuesto ("item:<id>" / "prep:<id>") en vez de dos
 * selectores separados — mismo criterio que CostStructureCalculator. */
function linkValueOf(inventoryItemId?: string | null, preparationId?: string | null): string {
  if (inventoryItemId) return `item:${inventoryItemId}`;
  if (preparationId) return `prep:${preparationId}`;
  return '';
}
function decodeLinkValue(value: string): { inventoryItemId: string | null; preparationId: string | null } {
  if (value.startsWith('item:')) return { inventoryItemId: value.slice(5), preparationId: null };
  if (value.startsWith('prep:')) return { inventoryItemId: null, preparationId: value.slice(5) };
  return { inventoryItemId: null, preparationId: null };
}
import { CURRENCY_SYMBOLS } from '@/utils/format';
import type { ModifierCategory, Modifier } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { OutlinedField, outlinedFieldInputClass } from '@/components/ui/outlined-field';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Biblioteca de "Modificadores": categorías reutilizables entre productos (Productos → Modificadores). */
export function ModifierCategoriesDialog({ open, onOpenChange }: Props) {
  const [categories, setCategories] = useState<ModifierCategory[] | null>(null);
  const [search, setSearch] = useState('');
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  // Id de la categoría que se está duplicando ahora mismo (deshabilita su botón mientras
  // corre) y último error de duplicar, si lo hubo — sin esto, un fallo (red, sesión vencida,
  // etc.) quedaba completamente silencioso: el botón no hacía nada visible.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  function load() {
    api.get('/modifier-categories').then((res) => setCategories(res.data.data));
  }

  useEffect(() => {
    if (open) load();
    else {
      setOpenCategoryId(null);
      setSearch('');
    }
  }, [open]);

  async function createCategory() {
    if (!newName.trim()) return;
    const res = await api.post('/modifier-categories', { name: newName.trim() });
    setNewName('');
    setCreating(false);
    load();
    setOpenCategoryId(res.data.data.id);
  }

  /** "Duplicar lista": copia la categoría completa (modificadores, vínculos a inventario, precios
   * por variante y productos asociados) y abre la copia para renombrarla. */
  async function duplicateCategory(id: string) {
    if (duplicatingId) return;
    setDuplicatingId(id);
    setDuplicateError(null);
    try {
      const res = await api.post(`/modifier-categories/${id}/duplicate`);
      load();
      setOpenCategoryId(res.data.data.id);
    } catch (err: any) {
      setDuplicateError(err.response?.data?.error ?? 'No se pudo duplicar la lista. Intenta de nuevo.');
    } finally {
      setDuplicatingId(null);
    }
  }

  const filtered = categories?.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const openCategory = categories?.find((c) => c.id === openCategoryId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {openCategory ? (
          <CategoryEditor
            category={openCategory}
            onBack={() => setOpenCategoryId(null)}
            onChanged={load}
            onDeleted={() => {
              setOpenCategoryId(null);
              load();
            }}
            onDuplicate={() => duplicateCategory(openCategory.id)}
            duplicating={duplicatingId === openCategory.id}
            duplicateError={duplicateError}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Editar modificadores
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-brand-950/70">
                  Categorías de modificadores {categories && <span className="text-brand-950/40">({categories.length})</span>}
                </p>
                <TextureButton
                  variant="secondary"
                  size="sm"
                  className="!w-auto flex items-center gap-1.5"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Crear categoría
                </TextureButton>
              </div>

              {creating && (
                <div className="flex items-center gap-2 rounded-xl border border-brand-950/10 p-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createCategory()}
                    placeholder="Ej: ¿Cómo la prefieres?"
                    className="flex-1 text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                  />
                  <TextureButton variant="brand" size="sm" className="!w-auto" onClick={createCategory}>
                    Crear
                  </TextureButton>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar categoría…"
                  className="w-full text-sm border border-brand-950/15 rounded-lg pl-8 pr-2.5 py-1.5"
                />
              </div>

              {duplicateError && <p className="text-xs text-red-600">{duplicateError}</p>}

              <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/10 max-h-96 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="p-5 text-center text-sm text-brand-950/40 font-light">Sin categorías todavía.</p>
                )}
                {filtered.map((c) => (
                  <div key={c.id} className="flex items-center gap-1 pr-2 hover:bg-brand-950/[0.02] transition-colors">
                    <button
                      onClick={() => setOpenCategoryId(c.id)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-950 truncate">{c.name}</p>
                        <p className="text-xs text-brand-950/40">
                          {c.modifiers.length} modificador{c.modifiers.length === 1 ? '' : 'es'}
                          {c.isRequired ? ' · Obligatorio' : ' · Opcional'}
                          {c.productCount != null && ` · ${c.productCount} producto${c.productCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-brand-950/30 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateCategory(c.id)}
                      disabled={duplicatingId === c.id}
                      title="Duplicar esta lista de modificadores"
                      aria-label={`Duplicar ${c.name}`}
                      className="shrink-0 rounded-full p-1.5 text-brand-950/40 hover:bg-brand-500/10 hover:text-brand-500 disabled:opacity-40"
                    >
                      <Copy className={`h-4 w-4 ${duplicatingId === c.id ? 'animate-pulse' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LinkedProduct {
  productId: string;
  name: string;
}

/** Producto con variantes (pricingMode "VARIANTS") entre los que la categoría tiene asociados —
 * es sobre estas variantes que se puede fijar un precio propio por modificador. */
interface VariantProductOption {
  id: string;
  name: string;
  pricingMode: string;
  variants: { id: string; name: string }[];
}

function CategoryEditor({
  category,
  onBack,
  onChanged,
  onDeleted,
  onDuplicate,
  duplicating,
  duplicateError,
}: {
  category: ModifierCategory;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
  duplicateError: string | null;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [name, setName] = useState(category.name);
  const [maxSelections, setMaxSelectionsInput] = useState(category.maxSelections?.toString() ?? '');
  const [minSelections, setMinSelectionsInput] = useState(category.minSelections?.toString() ?? '');
  const [unlimitedMax, setUnlimitedMax] = useState(category.maxSelections == null);
  // Insumos y preparaciones para el selector de vínculo de cada modificador. Se cargan
  // una vez por editor abierto y se comparten entre todas las filas.
  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [preparations, setPreparations] = useState<PreparationOption[]>([]);
  const linkEnabled = !!restaurant?.modifierInventoryLinkEnabled;
  const [allProducts, setAllProducts] = useState<VariantProductOption[] | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[] | null>(null);
  // Agregar modificador: "Escribir" (de siempre, un nombre libre) o "Desde Toppings" (elegir un
  // insumo ya marcado como topping — ver InventoryPage#toppings — y crear el modificador con su
  // nombre y ya vinculado a ese insumo, listo para descontar inventario al venderse).
  const [addMode, setAddMode] = useState<'escribir' | 'toppings'>('escribir');
  const [newModifierName, setNewModifierName] = useState('');
  const [selectedToppingId, setSelectedToppingId] = useState('');

  useEffect(() => setName(category.name), [category.id, category.name]);
  useEffect(() => setMaxSelectionsInput(category.maxSelections?.toString() ?? ''), [category.id, category.maxSelections]);
  useEffect(() => setUnlimitedMax(category.maxSelections == null), [category.id, category.maxSelections]);
  useEffect(() => setMinSelectionsInput(category.minSelections?.toString() ?? ''), [category.id, category.minSelections]);
  useEffect(() => {
    setAllProducts(null);
    setLinkedProducts(null);
  }, [category.id]);

  // Se necesita saber qué productos/variantes usa esta categoría para poder ofrecer "Precio por
  // variante" en cada modificador (no solo cuando el admin abre el desplegable Asociar/Desasociar).
  useEffect(() => {
    loadProductLinkData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  // Se cargan siempre (no solo con linkEnabled): el picker "Desde Toppings" al agregar un
  // modificador los necesita aunque el vínculo con inventario esté apagado — igual que antes,
  // el selector de "Descontar de inventario" de cada fila solo se muestra si linkEnabled.
  useEffect(() => {
    api
      .get('/inventory')
      .then((res) => setInsumos(res.data.data))
      .catch(() => setInsumos([]));
    // 403 si el plan no incluye Recetas/Preparaciones — sin preparaciones cargadas
    // simplemente no aparecen en el selector, el vínculo por insumo sigue igual.
    api
      .get('/inventory/preparations')
      .then((res) => setPreparations(res.data.data))
      .catch(() => setPreparations([]));
  }, []);

  async function saveName() {
    if (name.trim() && name !== category.name) {
      await api.patch(`/modifier-categories/${category.id}`, { name: name.trim() });
      onChanged();
    }
  }

  async function setRequired(isRequired: boolean) {
    await api.patch(`/modifier-categories/${category.id}`, { isRequired });
    onChanged();
  }

  async function setAllowMultiple(allowMultiple: boolean) {
    await api.patch(`/modifier-categories/${category.id}`, { allowMultiple });
    onChanged();
  }

  /** Límite de selecciones totales de la categoría (permite repetir la misma opción, ej. "Ketchup x4"). */
  async function saveMaxSelections() {
    const n = maxSelections.trim() === '' ? null : Number(maxSelections);
    if (n === (category.maxSelections ?? null)) return;
    await api.patch(`/modifier-categories/${category.id}`, { maxSelections: n });
    onChanged();
  }

  /** Mínimo de selecciones totales de la categoría (ej. "elige al menos 2"). */
  async function saveMinSelections() {
    const n = minSelections.trim() === '' ? null : Number(minSelections);
    if (n === (category.minSelections ?? null)) return;
    await api.patch(`/modifier-categories/${category.id}`, { minSelections: n });
    onChanged();
  }

  /** Casilla "Ilimitado": al marcarla, quita el tope (maxSelections = null) de inmediato.
   * Al desmarcarla, solo muestra el campo "Limitado a" — el número se guarda cuando el
   * usuario lo escribe y sale del campo (igual que el resto de los campos de este diálogo). */
  async function toggleUnlimitedMax(checked: boolean) {
    setUnlimitedMax(checked);
    if (checked) {
      setMaxSelectionsInput('');
      if (category.maxSelections != null) {
        await api.patch(`/modifier-categories/${category.id}`, { maxSelections: null });
        onChanged();
      }
    }
  }

  /** Tab "Escribir": nombre libre, igual que siempre — el resto (precio, vínculo con
   * inventario) se completa después en la fila. */
  async function addModifierByName() {
    const trimmed = newModifierName.trim();
    await api.post(`/modifier-categories/${category.id}/modifiers`, { name: trimmed || 'Nuevo modificador' });
    setNewModifierName('');
    onChanged();
  }

  /** Tab "Desde Toppings": crea el modificador con el nombre del topping y ya vinculado a su
   * insumo (1 unidad base, editable después en la fila) — la idea es no tener que buscarlo
   * entre todos los insumos ni escribir el vínculo a mano. */
  async function addModifierFromTopping() {
    const topping = toppings.find((t) => t.id === selectedToppingId);
    if (!topping) return;
    await api.post(`/modifier-categories/${category.id}/modifiers`, {
      name: topping.name,
      inventoryItemId: topping.id,
      inventoryQuantity: 1,
    });
    setSelectedToppingId('');
    onChanged();
  }

  async function removeCategory() {
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"? Se quita de todos los productos que la usan.`)) return;
    await api.delete(`/modifier-categories/${category.id}`);
    onDeleted();
  }

  /** Carga la lista de productos y cuáles ya tienen esta categoría asociada, la primera vez
   * que se abre el desplegable "Asociar / Desasociar". */
  async function loadProductLinkData() {
    if (allProducts !== null) return;
    const [productsRes, linkedRes] = await Promise.all([
      api.get('/products'),
      api.get(`/modifier-categories/${category.id}/products`),
    ]);
    setAllProducts(
      productsRes.data.data.map(
        (p: { id: string; name: string; pricingMode: string; variants?: { id: string; name: string }[] }) => ({
          id: p.id,
          name: p.name,
          pricingMode: p.pricingMode,
          variants: p.variants ?? [],
        }),
      ),
    );
    setLinkedProducts(linkedRes.data.data);
  }

  async function toggleProductLink(productId: string, checked: boolean) {
    if (checked) {
      await api.post(`/modifier-categories/${category.id}/products`, { productId });
      const product = allProducts?.find((p) => p.id === productId);
      setLinkedProducts((prev) => [...(prev ?? []), { productId, name: product?.name ?? '' }]);
    } else {
      await api.delete(`/modifier-categories/${category.id}/products/${productId}`);
      setLinkedProducts((prev) => (prev ?? []).filter((p) => p.productId !== productId));
    }
    onChanged();
  }

  /** Reordena dos modificadores adyacentes (botones ↑/↓ de cada fila) y persiste el nuevo orden. */
  async function moveModifier(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= category.modifiers.length) return;
    const modifierIds = category.modifiers.map((m) => m.id);
    [modifierIds[index], modifierIds[target]] = [modifierIds[target], modifierIds[index]];
    await api.patch(`/modifier-categories/${category.id}/modifiers/reorder`, { modifierIds });
    onChanged();
  }

  const toppings = insumos.filter((i) => i.isTopping);
  const linkedIds = new Set((linkedProducts ?? []).map((p) => p.productId));
  // Solo los productos asociados a esta categoría que cobran "por variantes" (ej. Pizza
  // Pequeña/Grande) tienen sentido para fijar un precio propio de modificador por variante.
  const variantProducts: VariantProductOption[] = (allProducts ?? []).filter(
    (p) => linkedIds.has(p.id) && p.pricingMode === 'VARIANTS' && p.variants.length > 0,
  );

  return (
    <>
      <DialogHeader className="flex-row items-center justify-between gap-2 pr-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="text-brand-950/50 hover:text-brand-950 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="truncate">{category.name}</DialogTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-brand-950/40 hover:text-brand-950 shrink-0 focus:outline-none">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDuplicate} disabled={duplicating}>
              <Copy className="h-3.5 w-3.5" /> {duplicating ? 'Duplicando…' : 'Duplicar lista'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={removeCategory} className="text-red-600 focus:bg-red-50 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar categoría
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogHeader>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto pt-2">
        {duplicateError && <p className="text-xs text-red-600">{duplicateError}</p>}
        <OutlinedField label="Categoría" hint={`${name.length}/150`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            maxLength={150}
            className={outlinedFieldInputClass}
          />
        </OutlinedField>

        <p className="text-sm font-semibold text-brand-950">Editar categoría de modificadores</p>

        <DropdownMenu onOpenChange={(o) => o && loadProductLinkData()}>
          <DropdownMenuTrigger asChild>
            <TextureButton variant="brand" size="default" className="!w-auto flex items-center gap-2">
              Asociar / Desasociar
              <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs leading-none">
                {category.productCount ?? 0}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </TextureButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            {allProducts === null ? (
              <p className="px-3 py-2 text-sm text-brand-950/40">Cargando…</p>
            ) : allProducts.length === 0 ? (
              <p className="px-3 py-2 text-sm text-brand-950/40">No hay productos todavía.</p>
            ) : (
              allProducts.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={linkedIds.has(p.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => toggleProductLink(p.id, checked === true)}
                >
                  {p.name}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-1.5">Seleccionar la condición</p>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={category.isRequired} onChange={() => setRequired(true)} /> Obligatorio
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!category.isRequired} onChange={() => setRequired(false)} /> Opcional
            </label>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-1.5">En esta categoría se puede seleccionar</p>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!category.allowMultiple} onChange={() => setAllowMultiple(false)} /> Sólo un
              modificador
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={category.allowMultiple} onChange={() => setAllowMultiple(true)} /> Varios
            </label>
          </div>
        </div>

        {category.allowMultiple && (
          <div className="space-y-2">
            <div className="flex gap-3">
              <OutlinedField label="Min" className="flex-1">
                <input
                  value={minSelections}
                  onChange={(e) => setMinSelectionsInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={saveMinSelections}
                  placeholder="0"
                  inputMode="numeric"
                  className={outlinedFieldInputClass}
                />
              </OutlinedField>
              {!unlimitedMax && (
                <OutlinedField label="Limitado a" className="flex-1">
                  <input
                    value={maxSelections}
                    onChange={(e) => setMaxSelectionsInput(e.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={saveMaxSelections}
                    placeholder="Ej: 3"
                    inputMode="numeric"
                    className={outlinedFieldInputClass}
                  />
                </OutlinedField>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-sm text-brand-950/70">
              <input type="checkbox" checked={unlimitedMax} onChange={(e) => toggleUnlimitedMax(e.target.checked)} />
              Ilimitado (sin tope de selecciones)
            </label>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-brand-950/70">
              Agregar los modificadores de esta categoría <span className="text-brand-950/40">({category.modifiers.length})</span>
            </p>
          </div>
          <div className="space-y-2">
            {category.modifiers.map((m, index) => (
              <ModifierRow
                key={m.id}
                modifier={m}
                categoryId={category.id}
                symbol={symbol}
                allowMultiple={category.allowMultiple}
                isFirst={index === 0}
                isLast={index === category.modifiers.length - 1}
                onMoveUp={() => moveModifier(index, -1)}
                onMoveDown={() => moveModifier(index, 1)}
                onChanged={onChanged}
                insumos={insumos}
                preparations={preparations}
                linkEnabled={linkEnabled}
                variantProducts={variantProducts}
              />
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-2.5 space-y-2">
            <div className="flex items-center gap-1 rounded-full bg-brand-950/[0.06] p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setAddMode('escribir')}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  addMode === 'escribir' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                Escribir
              </button>
              <button
                type="button"
                onClick={() => setAddMode('toppings')}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  addMode === 'toppings' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                Desde Toppings
              </button>
            </div>

            {addMode === 'escribir' ? (
              <div className="flex gap-1.5">
                <input
                  value={newModifierName}
                  onChange={(e) => setNewModifierName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addModifierByName())}
                  placeholder="Ej: Extra queso"
                  className={outlinedFieldInputClass}
                />
                <TextureButton variant="brand" size="sm" className="!w-auto shrink-0" onClick={addModifierByName}>
                  <Plus className="h-4 w-4" /> Agregar
                </TextureButton>
              </div>
            ) : toppings.length === 0 ? (
              <p className="text-xs text-brand-950/40 font-light">
                Todavía no tienes toppings cargados. Agrégalos en Inventario → Recetas → Toppings.
              </p>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={selectedToppingId}
                  onChange={(e) => setSelectedToppingId(e.target.value)}
                  className={outlinedFieldInputClass}
                >
                  <option value="">Elegir topping…</option>
                  {toppings.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({UNIT_LABELS[t.unit] ?? t.unit})
                    </option>
                  ))}
                </select>
                <TextureButton
                  variant="brand"
                  size="sm"
                  className="!w-auto shrink-0"
                  disabled={!selectedToppingId}
                  onClick={addModifierFromTopping}
                >
                  <Plus className="h-4 w-4" /> Agregar
                </TextureButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ModifierRow({
  modifier,
  categoryId,
  symbol,
  allowMultiple,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onChanged,
  insumos,
  preparations,
  linkEnabled,
  variantProducts,
}: {
  modifier: Modifier;
  categoryId: string;
  symbol: string;
  allowMultiple: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChanged: () => void;
  insumos: InsumoOption[];
  preparations: PreparationOption[];
  linkEnabled: boolean;
  variantProducts: VariantProductOption[];
}) {
  const [name, setName] = useState(modifier.name);
  const [price, setPrice] = useState(modifier.priceBase);
  const [maxQuantity, setMaxQuantityInput] = useState(modifier.maxQuantity?.toString() ?? '');
  const [showCost, setShowCost] = useState(!!modifier.costBase);
  const [showDiscount, setShowDiscount] = useState(!!modifier.discountBase);
  const [showSku, setShowSku] = useState(!!modifier.sku);
  const [cost, setCost] = useState(modifier.costBase ?? '');
  const [discount, setDiscount] = useState(modifier.discountBase ?? '');
  const [sku, setSku] = useState(modifier.sku ?? '');

  // --- Precio propio por variante (ej. "Extra queso" cuesta distinto en Pizza Grande vs.
  // Pequeña) — solo tiene sentido si la categoría está asociada a algún producto "por variantes".
  const [showVariantPrices, setShowVariantPrices] = useState((modifier.variantPrices?.length ?? 0) > 0);
  const [variantPriceInputs, setVariantPriceInputs] = useState<Record<string, string>>({});

  // --- Vínculo con inventario: insumo O preparación, nunca ambos. El selector combina las
  // dos listas con un value compuesto ("item:<id>" / "prep:<id>") — ver linkValueOf/decodeLinkValue. ---
  const [showInsumo, setShowInsumo] = useState(!!modifier.inventoryItemId || !!modifier.preparationId);
  const [linkValue, setLinkValue] = useState(linkValueOf(modifier.inventoryItemId, modifier.preparationId));
  const { inventoryItemId: insumoId, preparationId } = decodeLinkValue(linkValue);
  const linkedInsumo = insumos.find((i) => i.id === insumoId);
  const linkedPreparation = preparations.find((p) => p.id === preparationId);
  const insumoSubUnits = subUnitsFor(linkedInsumo?.unit ?? linkedPreparation?.unit ?? modifier.inventoryItemUnit ?? modifier.preparationUnit);
  const [subUnit, setSubUnit] = useState(insumoSubUnits[0]?.value ?? '');
  const [insumoQty, setInsumoQty] = useState('');

  useEffect(() => {
    setName(modifier.name);
    setPrice(modifier.priceBase);
    setMaxQuantityInput(modifier.maxQuantity?.toString() ?? '');
    setCost(modifier.costBase ?? '');
    setDiscount(modifier.discountBase ?? '');
    setSku(modifier.sku ?? '');
    setShowInsumo(!!modifier.inventoryItemId || !!modifier.preparationId);
    setLinkValue(linkValueOf(modifier.inventoryItemId, modifier.preparationId));
    // La cantidad guardada está en unidad base; se muestra en la sub-unidad más
    // legible (0.03 kg -> 30 en Gr) para que el usuario vea lo que escribió.
    const options = subUnitsFor(modifier.inventoryItemUnit ?? modifier.preparationUnit);
    const base = Number(modifier.inventoryQuantity ?? 0);
    const small = options.find((o) => o.toBase < 1);
    if (base > 0 && small && base < 1) {
      setSubUnit(small.value);
      setInsumoQty(String(Number((base / small.toBase).toFixed(2))));
    } else {
      setSubUnit(options[0]?.value ?? '');
      setInsumoQty(base > 0 ? String(Number(base.toFixed(3))) : '');
    }
    setShowVariantPrices((modifier.variantPrices?.length ?? 0) > 0);
    const priceInputs: Record<string, string> = {};
    for (const vp of modifier.variantPrices ?? []) priceInputs[vp.variantId] = vp.priceBase;
    setVariantPriceInputs(priceInputs);
  }, [modifier]);

  /** Precio por variante: vacío = borra el override (vuelve a usar el precio general de arriba). */
  async function saveVariantPrice(variantId: string, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      await api.delete(`/modifier-categories/modifiers/${modifier.id}/variant-prices/${variantId}`);
    } else {
      await api.put(`/modifier-categories/modifiers/${modifier.id}/variant-prices/${variantId}`, {
        priceBase: Number(trimmed) || 0,
      });
    }
    onChanged();
  }

  /** Guarda el vínculo convirtiendo la cantidad a la unidad base del insumo/preparación. */
  async function saveInsumoLink() {
    const factor = insumoSubUnits.find((u) => u.value === subUnit)?.toBase ?? 1;
    const baseQuantity = Number(insumoQty) * factor;
    if ((!insumoId && !preparationId) || !(baseQuantity > 0)) return;
    await save({ inventoryItemId: insumoId, preparationId, inventoryQuantity: baseQuantity });
  }

  async function clearInsumo() {
    setShowInsumo(false);
    setLinkValue('');
    setInsumoQty('');
    if (modifier.inventoryItemId || modifier.preparationId) {
      await save({ inventoryItemId: null, preparationId: null, inventoryQuantity: null });
    }
  }

  async function save(patch: Record<string, unknown>) {
    await api.patch(`/modifier-categories/modifiers/${modifier.id}`, patch);
    onChanged();
  }

  async function saveMaxQuantity() {
    const n = maxQuantity.trim() === '' ? null : Number(maxQuantity);
    if (n === (modifier.maxQuantity ?? null)) return;
    await save({ maxQuantity: n });
  }

  async function saveSku() {
    const trimmed = sku.trim() || null;
    if (trimmed === (modifier.sku ?? null)) return;
    await save({ sku: trimmed });
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar "${modifier.name}"?`)) return;
    await api.delete(`/modifier-categories/modifiers/${modifier.id}`);
    onChanged();
  }

  /** Crea una copia de este modificador en la misma categoría, con el mismo precio/costo/SKU/etc. */
  async function duplicate() {
    await api.post(`/modifier-categories/${categoryId}/modifiers`, {
      name: `${modifier.name} (copia)`,
      priceBase: Number(modifier.priceBase) || 0,
      costBase: modifier.costBase ? Number(modifier.costBase) : undefined,
      discountBase: modifier.discountBase ? Number(modifier.discountBase) : undefined,
      isAvailable: modifier.isAvailable,
      maxQuantity: modifier.maxQuantity,
      sku: modifier.sku,
    });
    onChanged();
  }

  return (
    <div className="rounded-xl border border-brand-950/10 p-2.5 space-y-2">
      <div className="flex items-start gap-1.5">
        <div className="flex flex-col gap-0.5 pt-1.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Subir"
            className="text-brand-950/30 hover:text-brand-950 disabled:opacity-20"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            title="Bajar"
            className="text-brand-950/30 hover:text-brand-950 disabled:opacity-20"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <OutlinedField label="Nombre de modificador" className="flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== modifier.name && save({ name: name.trim() })}
            className={outlinedFieldInputClass}
          />
        </OutlinedField>
        <button
          onClick={() => save({ isAvailable: !modifier.isAvailable })}
          title={modifier.isAvailable ? 'Ocultar' : 'Mostrar'}
          className={`mt-1.5 shrink-0 ${modifier.isAvailable ? 'text-brand-500' : 'text-brand-950/25'}`}
        >
          {modifier.isAvailable ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button onClick={duplicate} title="Duplicar" className="mt-1.5 text-brand-950/30 hover:text-brand-500 shrink-0">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={remove} title="Eliminar" className="mt-1.5 text-brand-950/30 hover:text-red-500 shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-1.5 pl-[26px]">
        <OutlinedField label="Precio" prefix={symbol} className="flex-1">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => save({ priceBase: Number(price) || 0 })}
            className={outlinedFieldInputClass}
          />
        </OutlinedField>
        {allowMultiple && (
          <OutlinedField label="Cant. max" className="flex-1">
            <input
              value={maxQuantity}
              onChange={(e) => setMaxQuantityInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveMaxQuantity}
              placeholder="—"
              inputMode="numeric"
              className={outlinedFieldInputClass}
            />
          </OutlinedField>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pl-[26px]">
        {!showCost && (
          <button
            type="button"
            onClick={() => setShowCost(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-950/50 bg-brand-950/[0.05] rounded-full px-2.5 py-1"
          >
            <Plus className="h-3 w-3" /> Costo
          </button>
        )}
        {!showDiscount && (
          <button
            type="button"
            onClick={() => setShowDiscount(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-950/50 bg-brand-950/[0.05] rounded-full px-2.5 py-1"
          >
            <Plus className="h-3 w-3" /> Descuento
          </button>
        )}
        {!showSku && (
          <button
            type="button"
            onClick={() => setShowSku(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-950/50 bg-brand-950/[0.05] rounded-full px-2.5 py-1"
          >
            <Plus className="h-3 w-3" /> SKU
          </button>
        )}
        {variantProducts.length > 0 && !showVariantPrices && (
          <button
            type="button"
            onClick={() => setShowVariantPrices(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-500 bg-brand-500/10 rounded-full px-2.5 py-1"
          >
            <Plus className="h-3 w-3" /> Precio por variante
          </button>
        )}
      </div>

      {/* Precio propio por variante (ej. "Extra queso" en Pizza Grande vs. Pequeña): solo
          aparece si esta categoría está asociada a algún producto que cobra "por variantes". */}
      {variantProducts.length > 0 && showVariantPrices && (
        <div className="pl-[26px] pt-1 space-y-2">
          <p className="text-xs font-medium text-brand-950/60">
            Precio por variante <span className="text-brand-950/35 font-normal">(vacío = usa {symbol}{price || '0'} de arriba)</span>
          </p>
          {variantProducts.map((product) => (
            <div key={product.id} className="rounded-xl border border-brand-950/10 p-2 space-y-1.5">
              {variantProducts.length > 1 && (
                <p className="text-xs font-medium text-brand-950/50 truncate">{product.name}</p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {product.variants.map((v) => (
                  <OutlinedField key={v.id} label={v.name} prefix={symbol}>
                    <input
                      value={variantPriceInputs[v.id] ?? ''}
                      onChange={(e) =>
                        setVariantPriceInputs((prev) => ({ ...prev, [v.id]: e.target.value.replace(/[^0-9.]/g, '') }))
                      }
                      onBlur={(e) => saveVariantPrice(v.id, e.target.value)}
                      placeholder="—"
                      className={outlinedFieldInputClass}
                    />
                  </OutlinedField>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCost || showDiscount || showSku) && (
        <div className="grid grid-cols-2 gap-1.5 pl-[26px]">
          {showCost && (
            <OutlinedField label={`Costo (${symbol})`}>
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={() => save({ costBase: cost ? Number(cost) : undefined })}
                className={outlinedFieldInputClass}
              />
            </OutlinedField>
          )}
          {showDiscount && (
            <OutlinedField label={`Descuento (${symbol})`}>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={() => save({ discountBase: discount ? Number(discount) : undefined })}
                className={outlinedFieldInputClass}
              />
            </OutlinedField>
          )}
          {showSku && (
            <OutlinedField label="SKU" className="col-span-2">
              <input value={sku} onChange={(e) => setSku(e.target.value)} onBlur={saveSku} className={outlinedFieldInputClass} />
            </OutlinedField>
          )}
        </div>
      )}

      {/* Vínculo con inventario: solo aparece si el restaurante lo activó desde
          Inventario. Sin insumos cargados no tiene sentido ofrecerlo. */}
      {linkEnabled && (
        <div className="pl-[26px] pt-1">
          {!showInsumo ? (
            <button
              type="button"
              onClick={() => setShowInsumo(true)}
              className="flex items-center gap-1 text-xs font-medium text-brand-500 bg-brand-500/10 rounded-full px-2.5 py-1"
            >
              <Plus className="h-3 w-3" /> Descontar de inventario
            </button>
          ) : (
            <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-brand-950/70">¿Este modificador sale del inventario?</p>
                <button
                  type="button"
                  onClick={clearInsumo}
                  className="text-xs font-medium text-red-500 hover:text-red-600 shrink-0"
                >
                  Quitar
                </button>
              </div>
              {insumos.length === 0 && preparations.length === 0 ? (
                <p className="text-xs text-brand-950/40 font-light">
                  Todavía no tienes insumos ni preparaciones cargados. Agrégalos en Inventario.
                </p>
              ) : (
                <>
                  <OutlinedField label="Insumo o preparación">
                    <select
                      value={linkValue}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLinkValue(next);
                        // Al cambiar de insumo/preparación, la sub-unidad por defecto es la
                        // suya (kg -> Kg, lt -> Lt, unidad -> Unidad).
                        const { inventoryItemId: nextItemId, preparationId: nextPrepId } = decodeLinkValue(next);
                        const unit = nextItemId
                          ? insumos.find((i) => i.id === nextItemId)?.unit
                          : preparations.find((p) => p.id === nextPrepId)?.unit;
                        setSubUnit(subUnitsFor(unit)[0]?.value ?? '');
                      }}
                      className={outlinedFieldInputClass}
                    >
                      <option value="">Elegir insumo o preparación…</option>
                      {insumos.length > 0 && (
                        <optgroup label="Insumos">
                          {insumos.map((i) => (
                            <option key={`item:${i.id}`} value={`item:${i.id}`}>
                              {i.name} ({UNIT_LABELS[i.unit] ?? i.unit})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {preparations.length > 0 && (
                        <optgroup label="Preparaciones">
                          {preparations.map((p) => (
                            <option key={`prep:${p.id}`} value={`prep:${p.id}`}>
                              {p.name} ({UNIT_LABELS[p.unit] ?? p.unit})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </OutlinedField>
                  <div className="flex gap-1.5">
                    <OutlinedField label="Cuánto usa" className="flex-1">
                      <input
                        value={insumoQty}
                        onChange={(e) => setInsumoQty(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="30"
                        className={outlinedFieldInputClass}
                      />
                    </OutlinedField>
                    <OutlinedField label="Unidad" className="w-28 shrink-0">
                      <select value={subUnit} onChange={(e) => setSubUnit(e.target.value)} className={outlinedFieldInputClass}>
                        {insumoSubUnits.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </OutlinedField>
                  </div>
                  <button
                    type="button"
                    onClick={saveInsumoLink}
                    disabled={!linkValue || !insumoQty}
                    className="w-full rounded-lg bg-brand-500 text-white text-xs font-semibold py-2 disabled:opacity-40"
                  >
                    Guardar vínculo
                  </button>
                  {(modifier.inventoryItemName || modifier.preparationName) && (
                    <p className="text-xs text-emerald-600">
                      Descontando{' '}
                      {formatBaseQuantity(Number(modifier.inventoryQuantity ?? 0), modifier.inventoryItemUnit ?? modifier.preparationUnit)}{' '}
                      de {modifier.inventoryItemName ?? modifier.preparationName} por cada unidad vendida.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
