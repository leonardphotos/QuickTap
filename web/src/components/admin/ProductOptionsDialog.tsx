import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { formatBase } from '@/utils/format';
import type { CartLine, Product, SelectedModifier } from '@/types';

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

function effectiveMin(category: Category): number {
  if (category.minSelections != null) return category.minSelections;
  return category.isRequired ? 1 : 0;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const modifierCategories = product.modifierCategories ?? [];
  const selectedVariant = product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers
      .filter((m) => (selectedQty[m.id] ?? 0) > 0)
      .map((m) => ({ modifierId: m.id, name: m.name, priceBase: m.priceBase, quantity: selectedQty[m.id] })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase) * m.quantity, 0);
  const unitPrice = basePrice + modifiersTotal;

  function categoryTotal(category: Category): number {
    return category.modifiers.reduce((acc, m) => acc + (selectedQty[m.id] ?? 0), 0);
  }

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some((c) => categoryTotal(c) < effectiveMin(c));
  const canAdd = !needsVariant && !missingRequiredCategory;

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
    onAdd({
      product,
      quantity,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      selectedModifiers: chosenModifiers,
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
                            {Number(m.priceBase) > 0 && (
                              <span className="text-brand-950/60 font-medium"> +{formatBase(m.priceBase, currencySymbol)}</span>
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
                        {Number(m.priceBase) > 0 && (
                          <span className="text-brand-950/60 font-medium">+{formatBase(m.priceBase, currencySymbol)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

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
