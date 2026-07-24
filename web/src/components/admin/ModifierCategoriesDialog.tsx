import { useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
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

              <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/10 max-h-96 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="p-5 text-center text-sm text-brand-950/40 font-light">Sin categorías todavía.</p>
                )}
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setOpenCategoryId(c.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-950/[0.02] transition-colors"
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

function CategoryEditor({
  category,
  onBack,
  onChanged,
  onDeleted,
}: {
  category: ModifierCategory;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [name, setName] = useState(category.name);
  const [maxSelections, setMaxSelectionsInput] = useState(category.maxSelections?.toString() ?? '');
  const [minSelections, setMinSelectionsInput] = useState(category.minSelections?.toString() ?? '');
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[] | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[] | null>(null);

  useEffect(() => setName(category.name), [category.id, category.name]);
  useEffect(() => setMaxSelectionsInput(category.maxSelections?.toString() ?? ''), [category.id, category.maxSelections]);
  useEffect(() => setMinSelectionsInput(category.minSelections?.toString() ?? ''), [category.id, category.minSelections]);
  useEffect(() => {
    setAllProducts(null);
    setLinkedProducts(null);
  }, [category.id]);

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

  async function addModifier() {
    await api.post(`/modifier-categories/${category.id}/modifiers`, { name: 'Nuevo modificador' });
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
    setAllProducts(productsRes.data.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
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

  const linkedIds = new Set((linkedProducts ?? []).map((p) => p.productId));

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
            <DropdownMenuItem onSelect={removeCategory} className="text-red-600 focus:bg-red-50 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar categoría
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogHeader>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto pt-2">
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
            <OutlinedField label="Max" className="flex-1">
              <input
                value={maxSelections}
                onChange={(e) => setMaxSelectionsInput(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={saveMaxSelections}
                placeholder="Sin límite"
                inputMode="numeric"
                className={outlinedFieldInputClass}
              />
            </OutlinedField>
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
                symbol={symbol}
                allowMultiple={category.allowMultiple}
                isFirst={index === 0}
                isLast={index === category.modifiers.length - 1}
                onMoveUp={() => moveModifier(index, -1)}
                onMoveDown={() => moveModifier(index, 1)}
                onChanged={onChanged}
              />
            ))}
          </div>
          <button
            onClick={addModifier}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            <Plus className="h-4 w-4" /> Agregar modificador
          </button>
        </div>
      </div>
    </>
  );
}

function ModifierRow({
  modifier,
  symbol,
  allowMultiple,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onChanged,
}: {
  modifier: Modifier;
  symbol: string;
  allowMultiple: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChanged: () => void;
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

  useEffect(() => {
    setName(modifier.name);
    setPrice(modifier.priceBase);
    setMaxQuantityInput(modifier.maxQuantity?.toString() ?? '');
    setCost(modifier.costBase ?? '');
    setDiscount(modifier.discountBase ?? '');
    setSku(modifier.sku ?? '');
  }, [modifier]);

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
        <button onClick={remove} className="mt-1.5 text-brand-950/30 hover:text-red-500 shrink-0">
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
      </div>
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
    </div>
  );
}
