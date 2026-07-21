import { useEffect, useState } from 'react';
import { ChevronRight, ArrowLeft, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import type { ModifierCategory, Modifier } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

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

  useEffect(() => setName(category.name), [category.id, category.name]);

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

  async function addModifier() {
    await api.post(`/modifier-categories/${category.id}/modifiers`, { name: 'Nuevo modificador' });
    onChanged();
  }

  async function removeCategory() {
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"? Se quita de todos los productos que la usan.`)) return;
    await api.delete(`/modifier-categories/${category.id}`);
    onDeleted();
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-brand-950/50 hover:text-brand-950 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="truncate">{category.name}</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <label className="block text-sm">
          <span className="text-xs font-medium text-brand-950/50">Categoría</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            maxLength={150}
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>

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

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-brand-950/70">
              Modificadores de esta categoría <span className="text-brand-950/40">({category.modifiers.length})</span>
            </p>
          </div>
          <div className="space-y-2">
            {category.modifiers.map((m) => (
              <ModifierRow key={m.id} modifier={m} symbol={symbol} onChanged={onChanged} />
            ))}
          </div>
          <button
            onClick={addModifier}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            <Plus className="h-4 w-4" /> Agregar modificador
          </button>
        </div>

        <button onClick={removeCategory} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 pt-2 border-t border-brand-950/10">
          <Trash2 className="h-3.5 w-3.5" /> Eliminar categoría
        </button>
      </div>
    </>
  );
}

function ModifierRow({
  modifier,
  symbol,
  onChanged,
}: {
  modifier: Modifier;
  symbol: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState(modifier.name);
  const [price, setPrice] = useState(modifier.priceBase);
  const [showCost, setShowCost] = useState(!!modifier.costBase);
  const [showDiscount, setShowDiscount] = useState(!!modifier.discountBase);
  const [cost, setCost] = useState(modifier.costBase ?? '');
  const [discount, setDiscount] = useState(modifier.discountBase ?? '');

  useEffect(() => {
    setName(modifier.name);
    setPrice(modifier.priceBase);
    setCost(modifier.costBase ?? '');
    setDiscount(modifier.discountBase ?? '');
  }, [modifier]);

  async function save(patch: Record<string, unknown>) {
    await api.patch(`/modifier-categories/modifiers/${modifier.id}`, patch);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar "${modifier.name}"?`)) return;
    await api.delete(`/modifier-categories/modifiers/${modifier.id}`);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-brand-950/10 p-2.5 space-y-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== modifier.name && save({ name: name.trim() })}
          className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5 min-w-0"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-brand-950/40">{symbol}</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => save({ priceBase: Number(price) || 0 })}
            className="w-16 text-sm border border-brand-950/15 rounded-lg px-2 py-1.5"
          />
        </div>
        <button
          onClick={() => save({ isAvailable: !modifier.isAvailable })}
          title={modifier.isAvailable ? 'Ocultar' : 'Mostrar'}
          className={modifier.isAvailable ? 'text-brand-500' : 'text-brand-950/25'}
        >
          {modifier.isAvailable ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button onClick={remove} className="text-brand-950/30 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
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
      </div>
      {(showCost || showDiscount) && (
        <div className="grid grid-cols-2 gap-1.5">
          {showCost && (
            <label className="block text-xs">
              <span className="text-brand-950/40">Costo ({symbol})</span>
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={() => save({ costBase: cost ? Number(cost) : undefined })}
                className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1"
              />
            </label>
          )}
          {showDiscount && (
            <label className="block text-xs">
              <span className="text-brand-950/40">Descuento ({symbol})</span>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={() => save({ discountBase: discount ? Number(discount) : undefined })}
                className="mt-0.5 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
