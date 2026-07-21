import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { CartLine, ModifierCategory, Product, Restaurant, SelectedModifier } from '../../types';
import { formatBase, publicPriceLabel } from '../../utils/format';
import {
  FamilyDrawerRoot,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerClose,
} from '@/components/ui/family-drawer';

interface Props {
  product: Product | null;
  restaurant: Restaurant;
  allProducts: Product[];
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  onSelectProduct: (product: Product) => void;
  /** Al tocar la foto grande de arriba se abre la galería a pantalla completa. */
  onOpenGallery: (product: Product) => void;
  orderingEnabled: boolean;
}

function categoryHint(category: ModifierCategory): string {
  if (category.isRequired) return category.allowMultiple ? 'Selecciona al menos una opción' : 'Selecciona una opción';
  return category.allowMultiple ? 'Elige las que quieras' : 'Opcional';
}

function pickSuggestions(all: Product[], excludeId: string, count: number): Product[] {
  const pool = all.filter((p) => p.id !== excludeId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function ProductDetailSheet({
  product,
  restaurant,
  allProducts,
  onClose,
  onAdd,
  onSelectProduct,
  onOpenGallery,
  orderingEnabled,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuantity(1);
    setNote('');
    setJustAdded(false);
    const firstVariant = product?.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.isAvailable !== false) : undefined;
    setSelectedVariantId(firstVariant?.id ?? null);
    setSelectedModifierIds([]);
    setCollapsedCategories(new Set());
  }, [product?.id]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const suggestions = useMemo(() => {
    if (!product) return [];
    return pickSuggestions(allProducts, product.id, 3);
  }, [product?.id, allProducts]);

  if (!product) return null;

  const modifierCategories = product.modifierCategories ?? [];
  const selectedVariant =
    product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    c.modifiers.filter((m) => selectedModifierIds.includes(m.id)).map((m) => ({ modifierId: m.id, name: m.name, priceBase: m.priceBase })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase), 0);
  const unitPrice = basePrice + modifiersTotal;
  const price = publicPriceLabel(unitPrice, restaurant);
  const lineTotal = publicPriceLabel(unitPrice * quantity, restaurant);

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some(
    (c) => c.isRequired && !c.modifiers.some((m) => selectedModifierIds.includes(m.id)),
  );
  const canAdd = !needsVariant && !missingRequiredCategory;

  function toggleCollapse(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

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
    if (!product || !canAdd) return;
    onAdd({
      product,
      quantity,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      selectedModifiers: chosenModifiers,
      note: note.trim() || undefined,
    });
    setQuantity(1);
    setNote('');
    setJustAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <FamilyDrawerRoot open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <FamilyDrawerPortal>
        <FamilyDrawerOverlay onClick={onClose} />
        <FamilyDrawerContent>
          <FamilyDrawerAnimatedWrapper className="!px-0 !pt-0">
            <FamilyDrawerClose className="!bg-white/90 shadow-md !text-brand-950" />

            <div className="max-h-[75vh] overflow-y-auto">
              {product.photoUrl ? (
                <img
                  src={product.photoUrl}
                  alt={product.name}
                  onClick={() => onOpenGallery(product)}
                  className="h-52 w-full object-cover cursor-pointer"
                />
              ) : (
                <div className="h-52 w-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-6xl">
                  🍽️
                </div>
              )}

              <div className="px-6 pt-4 pb-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-brand-950">{product.name}</h2>
                  {(product.isStar || product.isPromo || product.isHouseSpecial) && (
                    <div className="flex gap-1 shrink-0 pt-1">
                      {product.isStar && <Badge color="amber">Estrella</Badge>}
                      {product.isPromo && <Badge color="rose">Promo</Badge>}
                      {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
                    </div>
                  )}
                </div>

                {product.description && (
                  <p className="text-sm text-brand-950/60 font-light mt-2 leading-relaxed">{product.description}</p>
                )}

                {product.prepTimeMinutes != null && (
                  <p className="text-xs text-brand-950/50 font-light mt-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> ~{product.prepTimeMinutes} min
                  </p>
                )}

                {orderingEnabled && (
                  <>
                    {product.pricingMode === 'VARIANTS' && product.variants && product.variants.length > 0 && (
                      <div className="mt-5">
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
                                <input
                                  type="radio"
                                  name="variant"
                                  checked={selectedVariantId === v.id}
                                  onChange={() => setSelectedVariantId(v.id)}
                                />
                                {v.name}
                              </span>
                              <span className="text-brand-950/60 font-medium">
                                {formatBase(v.priceBase, restaurant.currencySymbol)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {modifierCategories.map((category) => {
                      const collapsed = collapsedCategories.has(category.id);
                      const chosenInCategory = category.modifiers.filter((m) => selectedModifierIds.includes(m.id)).length;
                      return (
                        <div key={category.id} className="mt-5 border-t border-brand-950/10 pt-4 first:border-t-0 first:pt-0">
                          <button
                            type="button"
                            onClick={() => toggleCollapse(category.id)}
                            className="w-full flex items-center justify-between gap-2 text-left"
                          >
                            <div>
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
                              <p className="text-xs text-brand-950/40 mt-0.5">
                                {categoryHint(category)}
                                {chosenInCategory > 0 && ` · ${chosenInCategory} elegido${chosenInCategory > 1 ? 's' : ''}`}
                              </p>
                            </div>
                            <span className="shrink-0 text-brand-950/40">
                              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                            </span>
                          </button>
                          {!collapsed && (
                            <div className="space-y-2 mt-2.5">
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
                                      <span className="text-brand-950/60 font-medium">
                                        +{formatBase(m.priceBase, restaurant.currencySymbol)}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between mt-5">
                      <span className="text-sm font-medium text-brand-950/70">Cantidad</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center disabled:opacity-40"
                          disabled={quantity <= 1}
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold text-brand-950">{quantity}</span>
                        <button
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota de cocina (ej: sin cebolla)"
                      className="w-full mt-4 text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />

                    <div className="flex items-center gap-3 mt-5">
                      <div className="bg-brand-500 text-[color:var(--qt-button-text,white)] rounded-full px-4 py-3 text-sm font-semibold whitespace-nowrap">
                        {lineTotal.primary}
                      </div>
                      <button
                        onClick={confirmAdd}
                        disabled={justAdded || !canAdd}
                        className="flex-1 rounded-full bg-brand-500 text-white text-sm font-semibold tracking-wide py-3 flex items-center justify-center gap-1.5 shadow-[0_16px_32px_-8px_rgba(5,108,242,0.45)] transition-opacity disabled:opacity-50"
                      >
                        {justAdded ? (
                          <>
                            <Check className="h-4 w-4" /> AÑADIDO
                          </>
                        ) : (
                          'AÑADIR AL CARRITO'
                        )}
                      </button>
                    </div>
                    {price.secondary && (
                      <p className="text-xs text-brand-950/40 text-center mt-2">Equivalente: {price.secondary}</p>
                    )}
                  </>
                )}

                {suggestions.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-brand-950/10">
                    <p className="text-sm font-semibold text-brand-950 mb-3">También te puede interesar</p>
                    <div className="grid grid-cols-3 gap-2">
                      {suggestions.map((s) => (
                        <SuggestionCard key={s.id} product={s} restaurant={restaurant} onClick={() => onSelectProduct(s)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FamilyDrawerAnimatedWrapper>
        </FamilyDrawerContent>
      </FamilyDrawerPortal>
    </FamilyDrawerRoot>
  );
}

function SuggestionCard({ product, restaurant, onClick }: { product: Product; restaurant: Restaurant; onClick: () => void }) {
  const price = publicPriceLabel(product.price, restaurant);
  return (
    <button onClick={onClick} className="text-center">
      {product.photoUrl ? (
        <img
          src={product.photoUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-16 w-full rounded-xl object-cover mb-1"
        />
      ) : (
        <div className="h-16 w-full rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-xl mb-1">
          🍽️
        </div>
      )}
      <p className="text-xs font-medium text-brand-950 truncate">{product.name}</p>
      <p className="text-[11px] text-brand-950/50">{price.primary}</p>
    </button>
  );
}

function Badge({ children, color }: { children: string; color: 'amber' | 'rose' | 'indigo' }) {
  const map = {
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[color]}`}>{children}</span>;
}
