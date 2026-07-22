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
   * preselecciona por nombre lo que ya tenía (best-effort, no hay FK guardada al variante/modificador). */
  initialVariantId?: string | null;
  initialModifierIds?: string[];
  initialQuantity?: number;
  initialNote?: string;
  confirmLabel?: string;
}

function categoryHint(category: NonNullable<Product['modifierCategories']>[number]): string {
  if (category.isRequired) return category.allowMultiple ? 'Selecciona al menos una opción' : 'Selecciona una opción';
  return category.allowMultiple ? 'Elige las que quieras' : 'Opcional';
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
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>(initialModifierIds ?? []);

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
    setSelectedModifierIds(initialModifierIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const modifierCategories = product.modifierCategories ?? [];
  const selectedVariant = product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers.filter((m) => selectedModifierIds.includes(m.id)).map((m) => ({ modifierId: m.id, name: m.name, priceBase: m.priceBase })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase), 0);
  const unitPrice = basePrice + modifiersTotal;

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some(
    (c) => c.isRequired && !c.modifiers.some((m) => selectedModifierIds.includes(m.id)),
  );
  const canAdd = !needsVariant && !missingRequiredCategory;

  function toggleModifier(category: NonNullable<Product['modifierCategories']>[number], modifierId: string) {
    setSelectedModifierIds((prev) => {
      const inCategory = new Set(category.modifiers.map((m) => m.id));
      if (category.allowMultiple) {
        return prev.includes(modifierId) ? prev.filter((id) => id !== modifierId) : [...prev, modifierId];
      }
      const withoutCategory = prev.filter((id) => !inCategory.has(id));
      if (prev.includes(modifierId) && !category.isRequired) return withoutCategory;
      return [...withoutCategory, modifierId];
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

          {modifierCategories.map((category) => (
            <div key={category.id}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-brand-950">{category.name}</p>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    category.isRequired ? 'bg-amber-100 text-amber-700' : 'bg-brand-950/5 text-brand-950/40'
                  }`}
                >
                  {category.isRequired ? 'Obligatorio' : 'Opcional'}
                </span>
              </div>
              <p className="text-xs text-brand-950/40 mt-0.5 mb-2">{categoryHint(category)}</p>
              <div className="space-y-2">
                {category.modifiers.map((m) => {
                  const checked = selectedModifierIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                        checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-brand-950">
                        <input
                          type={category.allowMultiple ? 'checkbox' : 'radio'}
                          name={category.allowMultiple ? undefined : `modifier-${category.id}`}
                          checked={checked}
                          onChange={() => toggleModifier(category, m.id)}
                        />
                        {m.name}
                      </span>
                      {Number(m.priceBase) > 0 && (
                        <span className="text-brand-950/60 font-medium">+{formatBase(m.priceBase, currencySymbol)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
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
