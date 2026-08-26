import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { formatBase } from '@/utils/format';
import { effectiveModifierPrice } from '@/utils/modifierLimits';
import type { CartLine, ComboComponentInfo, ComboSelection, ModifierCategory, Product, SelectedModifier } from '@/types';

interface Props {
  product: Product;
  currencySymbol: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  /** Editar un ítem ya pedido (ej: cambiar un ceviche pequeño por uno grande con extra de camarón):
   * preselecciona por nombre lo que ya tenía (best-effort, no hay FK guardada al variante/modificador).
   * Un id repetido representa cantidad (ej. ['ketchup','ketchup'] = Ketchup x2), igual que el
   * formato que ya viaja al backend en `modifierIds`. */
  initialVariantId?: string | null;
  initialModifierIds?: string[];
  initialQuantity?: number;
  initialNote?: string;
  confirmLabel?: string;
}

type Category = NonNullable<Product['modifierCategories']>[number];

function effectiveMax(category: Category): number {
  if (category.maxSelections != null) return category.maxSelections;
  return category.allowMultiple ? Infinity : 1;
}

/** isRequired manda: una categoría "Opcional" nunca exige nada, tenga o no un minSelections
 * guardado — ver misma nota en web/src/utils/modifierLimits.ts. */
function effectiveMin(category: Category): number {
  if (!category.isRequired) return 0;
  return category.minSelections ?? 1;
}

function categoryHint(category: Category): string {
  const max = effectiveMax(category);
  const min = effectiveMin(category);
  if (category.allowMultiple && Number.isFinite(max)) {
    if (min > 1) return `Elige al menos ${min} (hasta ${max})`;
    return category.isRequired ? `Elige hasta ${max} (puedes repetir una opción)` : `Opcional · hasta ${max}`;
  }
  if (min > 1) return `Elige al menos ${min} opciones`;
  if (category.isRequired) return category.allowMultiple ? 'Selecciona al menos una opción' : 'Selecciona una opción';
  return category.allowMultiple ? 'Elige las que quieras' : 'Opcional';
}

/** modifierId -> cantidad elegida (solo entradas > 0). */
function initialQtyFrom(ids: string[] | undefined): Record<string, number> {
  const qty: Record<string, number> = {};
  for (const id of ids ?? []) qty[id] = (qty[id] ?? 0) + 1;
  return qty;
}

/** Elegir variante + modificadores + cantidad para un producto, usado por el wizard "Crear pedido"
 * del panel y por "Editar pedido" (añadir producto nuevo o editar la variante/modificadores de uno ya pedido). */
export function ProductOptionsDialog({
  product,
  currencySymbol,
  onClose,
  onAdd,
  initialVariantId,
  initialModifierIds,
  initialQuantity,
  initialNote,
  confirmLabel,
}: Props) {
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [note, setNote] = useState(initialNote ?? '');
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId !== undefined
      ? initialVariantId
      : product.pricingMode === 'VARIANTS'
        ? product.variants?.find((v) => v.isAvailable !== false)?.id ?? null
        : null,
  );
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>(() => initialQtyFrom(initialModifierIds));

  // Combo armable: una instancia por cada unidad de cada plato componente (2 wokbox = dos
  // instancias que se arman POR SEPARADO). El estado vive por instancia: clave "idx" del
  // arreglo aplanado, y adentro modifierId -> cantidad, igual que selectedQty.
  const comboInstances = (product.comboComponents ?? []).flatMap((c) =>
    Array.from({ length: c.quantity }, (_, i) => ({ comp: c, n: i + 1 })),
  );
  const [comboQty, setComboQty] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    setQuantity(initialQuantity ?? 1);
    setNote(initialNote ?? '');
    setSelectedVariantId(
      initialVariantId !== undefined
        ? initialVariantId
        : product.pricingMode === 'VARIANTS'
          ? product.variants?.find((v) => v.isAvailable !== false)?.id ?? null
          : null,
    );
    setSelectedQty(initialQtyFrom(initialModifierIds));
    setComboQty({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const modifierCategories = product.modifierCategories ?? [];
  const selectedVariant = product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers
      .filter((m) => (selectedQty[m.id] ?? 0) > 0)
      .map((m) => ({
        modifierId: m.id,
        name: m.name,
        priceBase: String(effectiveModifierPrice(m, selectedVariant?.id)),
        quantity: selectedQty[m.id],
      })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase) * m.quantity, 0);

  function categoryTotal(category: Category): number {
    return category.modifiers.reduce((acc, m) => acc + (selectedQty[m.id] ?? 0), 0);
  }

  // Total y validez de las instancias del combo: cada plato armado cumple sus categorias
  // obligatorias, y los extras con precio suman al total que se muestra.
  const comboExtraTotal = comboInstances.reduce((acc, inst, idx) => {
    const qty = comboQty[idx] ?? {};
    return acc + inst.comp.modifierCategories.reduce(
      (a, cat) => a + cat.modifiers.reduce((x, m) => x + Number(m.priceBase ?? 0) * (qty[m.id] ?? 0), 0),
      0,
    );
  }, 0);
  const comboIncomplete = comboInstances.some((inst, idx) => {
    const qty = comboQty[idx] ?? {};
    return inst.comp.modifierCategories.some((cat) => {
      const total = cat.modifiers.reduce((a, m) => a + (qty[m.id] ?? 0), 0);
      return total < effectiveMin(cat as Category);
    });
  });

  const unitPrice = basePrice + modifiersTotal + comboExtraTotal;

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some((c) => categoryTotal(c) < effectiveMin(c));
  const canAdd = !needsVariant && !missingRequiredCategory && !comboIncomplete;

  /** Categorías de una sola opción (radio): click en la ya elegida la deselecciona (si es opcional). */
  function toggleSingle(category: Category, modifierId: string) {
    setSelectedQty((prev) => {
      const next = { ...prev };
      const wasSelected = (prev[modifierId] ?? 0) > 0;
      for (const m of category.modifiers) delete next[m.id];
      if (wasSelected && !category.isRequired) return next;
      next[modifierId] = 1;
      return next;
    });
  }

  /** Categorías de varias opciones: stepper por modificador, respetando el límite total de la
   * categoría y el tope propio del modificador (si tiene uno). */
  function stepQty(category: Category, modifierId: string, delta: number) {
    setSelectedQty((prev) => {
      const current = prev[modifierId] ?? 0;
      const modifierMax = category.modifiers.find((m) => m.id === modifierId)?.maxQuantity ?? Infinity;
      if (delta > 0 && (categoryTotal(category) >= effectiveMax(category) || current >= modifierMax)) return prev;
      const next = Math.max(0, current + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[modifierId];
      else updated[modifierId] = next;
      return updated;
    });
  }

  function confirmAdd() {
    if (!canAdd) return;
    const comboSelections: ComboSelection[] | undefined = comboInstances.length
      ? comboInstances.map((inst, idx) => ({
          componentProductId: inst.comp.componentProductId,
          modifierIds: Object.entries(comboQty[idx] ?? {}).flatMap(([id, q]) => Array(q).fill(id) as string[]),
        }))
      : undefined;
    onAdd({
      product,
      quantity,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      selectedModifiers: chosenModifiers,
      comboSelections,
      comboExtraTotal: comboInstances.length ? comboExtraTotal : undefined,
      note: note.trim() || undefined,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {product.pricingMode === 'VARIANTS' && product.variants && product.variants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-brand-950/70 mb-2">Elige una opción</p>
              <div className="space-y-2">
                {product.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                      selectedVariantId === v.id ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-brand-950">
                      <input type="radio" name="variant" checked={selectedVariantId === v.id} onChange={() => setSelectedVariantId(v.id)} />
                      {v.name}
                    </span>
                    <span className="text-brand-950/60 font-medium">{formatBase(v.priceBase, currencySymbol)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {modifierCategories.map((category) => {
            const total = categoryTotal(category);
            const max = effectiveMax(category);
            return (
              <div key={category.id}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-brand-950">{category.name}</p>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      category.isRequired ? 'bg-amber-100 text-amber-700' : 'bg-brand-950/5 text-brand-950/40'
                    }`}
                  >
                    {category.isRequired ? 'Obligatorio' : 'Opcional'}
                  </span>
                  {Number.isFinite(max) && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-400/10 text-brand-600">
                      {total}/{max} seleccionados
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand-950/40 mt-0.5 mb-2">{categoryHint(category)}</p>
                <div className="space-y-2">
                  {category.modifiers.map((m) => {
                    const qty = selectedQty[m.id] ?? 0;
                    const checked = qty > 0;
                    const modPrice = effectiveModifierPrice(m, selectedVariant?.id);

                    if (category.allowMultiple) {
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                            checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                          }`}
                        >
                          <span className="text-brand-950 min-w-0 truncate">
                            {m.name}
                            {modPrice > 0 && (
                              <span className="text-brand-950/60 font-medium"> +{formatBase(modPrice, currencySymbol)}</span>
                            )}
                          </span>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => stepQty(category, m.id, -1)}
                              disabled={qty === 0}
                              className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-medium">{qty}</span>
                            <button
                              type="button"
                              onClick={() => stepQty(category, m.id, 1)}
                              disabled={total >= max || qty >= (m.maxQuantity ?? Infinity)}
                              className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleSingle(category, m.id)}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm text-left ${
                          checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-brand-950">
                          <span
                            className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                              checked ? 'border-brand-500' : 'border-brand-950/25'
                            }`}
                          >
                            {checked && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                          </span>
                          {m.name}
                        </span>
                        {modPrice > 0 && (
                          <span className="text-brand-950/60 font-medium">+{formatBase(modPrice, currencySymbol)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {comboInstances.map((inst, idx) => (
            <ComboInstancePicker
              key={idx}
              titulo={inst.comp.quantity > 1 ? `${inst.comp.name} (${inst.n})` : inst.comp.name}
              categorias={inst.comp.modifierCategories}
              qty={comboQty[idx] ?? {}}
              currencySymbol={currencySymbol}
              onChange={(next) => setComboQty((prev) => ({ ...prev, [idx]: next }))}
            />
          ))}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-950/70">Cantidad</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-full border border-brand-950/20 font-bold text-brand-950 flex items-center justify-center disabled:opacity-30"
              >
                −
              </button>
              <span className="w-5 text-center font-semibold text-brand-950">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-full border border-brand-950/20 font-bold text-brand-950 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota de cocina (ej: sin cebolla)"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />

          <TextureButton
            variant="brand"
            size="default"
            disabled={!canAdd}
            onClick={confirmAdd}
            className="disabled:opacity-50"
          >
            {confirmLabel ?? 'Agregar'} · {formatBase(unitPrice * quantity, currencySymbol)}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Un plato DENTRO de un combo, armándose: sus categorías de modificadores con la misma
 * interacción del diálogo (radio para una opción, stepper para varias), pero con estado
 * propio por instancia — dos wokbox del mismo combo se arman distinto.
 */
export function ComboInstancePicker({
  titulo,
  categorias,
  qty,
  currencySymbol,
  onChange,
}: {
  titulo: string;
  categorias: ComboComponentInfo['modifierCategories'];
  qty: Record<string, number>;
  currencySymbol: string;
  onChange: (next: Record<string, number>) => void;
}) {
  function totalDe(cat: ModifierCategory): number {
    return cat.modifiers.reduce((a, m) => a + (qty[m.id] ?? 0), 0);
  }

  function toggleSingle(cat: ModifierCategory, modifierId: string) {
    const next = { ...qty };
    const estaba = (qty[modifierId] ?? 0) > 0;
    for (const m of cat.modifiers) delete next[m.id];
    if (!(estaba && !cat.isRequired)) next[modifierId] = 1;
    onChange(next);
  }

  function step(cat: ModifierCategory, modifierId: string, delta: number) {
    const current = qty[modifierId] ?? 0;
    const max = effectiveMax(cat as Category);
    const modMax = cat.modifiers.find((m) => m.id === modifierId)?.maxQuantity ?? Infinity;
    if (delta > 0 && (totalDe(cat) >= max || current >= modMax)) return;
    const next = { ...qty };
    const val = Math.max(0, current + delta);
    if (val === 0) delete next[modifierId];
    else next[modifierId] = val;
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] p-3">
      <p className="mb-2 text-sm font-bold text-brand-950">▪ {titulo}</p>
      <div className="space-y-3">
        {categorias.map((cat) => {
          const total = totalDe(cat);
          const max = effectiveMax(cat as Category);
          const min = effectiveMin(cat as Category);
          return (
            <div key={cat.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-brand-950">{cat.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                    cat.isRequired ? 'bg-amber-100 text-amber-700' : 'bg-brand-950/5 text-brand-950/40'
                  }`}
                >
                  {cat.isRequired ? 'Obligatorio' : 'Opcional'}
                </span>
                {Number.isFinite(max) && max > 1 && (
                  <span className="rounded-full bg-brand-400/10 px-2 py-0.5 text-[10.5px] font-medium text-brand-600">
                    {total}/{max}
                  </span>
                )}
              </div>
              {min > 1 && <p className="mt-0.5 text-[11px] text-brand-950/40">Elige al menos {min}</p>}
              <div className="mt-1.5 space-y-1.5">
                {cat.modifiers.map((m) => {
                  const q = qty[m.id] ?? 0;
                  const checked = q > 0;
                  const precio = Number(m.priceBase ?? 0);
                  if (cat.allowMultiple) {
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-[13px] ${
                          checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10 bg-white'
                        }`}
                      >
                        <span className="min-w-0 truncate text-brand-950">
                          {m.name}
                          {precio > 0 && <span className="font-medium text-brand-950/60"> +{formatBase(precio, currencySymbol)}</span>}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button type="button" onClick={() => step(cat, m.id, -1)} disabled={q === 0} className="h-6 w-6 rounded-full border border-brand-950/20 text-xs font-bold text-brand-950 disabled:opacity-30">−</button>
                          <span className="w-4 text-center text-[13px] font-medium">{q}</span>
                          <button type="button" onClick={() => step(cat, m.id, 1)} disabled={total >= max || q >= (m.maxQuantity ?? Infinity)} className="h-6 w-6 rounded-full border border-brand-950/20 text-xs font-bold text-brand-950 disabled:opacity-30">+</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleSingle(cat, m.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left text-[13px] ${
                        checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10 bg-white'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-brand-950">
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-brand-500' : 'border-brand-950/25'}`}>
                          {checked && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                        </span>
                        {m.name}
                      </span>
                      {precio > 0 && <span className="font-medium text-brand-950/60">+{formatBase(precio, currencySymbol)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
